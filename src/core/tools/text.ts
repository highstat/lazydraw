// Text tool. Based on ASCIIFlow (client/draw/text.ts), MIT © Lewis Hemens.
// Two modes:
//   inplace — edits the existing label under the cursor (the familiar behaviour)
//   layer   — always writes a fresh overlay and commits it as one undo step
// configuration lives in `settings → text`.
import type { Box } from "../box";
import { findBox } from "../entity";
import { isBoxDrawing } from "../glyphs";
import { Layer } from "../layer";
import { isPlaceable, isText, transformChar } from "../text";
import { Vector } from "../vector";
import { KEY, type HoverHint, type Mods, type Tool, type ToolContext } from "./tool";

interface Snapshot {
  layer: Layer;
  cursor: Vector;
  typed: string;
}

interface EditSession {
  left: number;
  right: number;
  y: number;
  buffer: string[];
  cursor: number;
  history: { buffer: string[]; cursor: number; typed: string }[];
  /** Widened when there is no surrounding box, so typing can grow the label. */
  maxWidth: number;
  /** The box whose interior is being edited, when there is one. */
  box: Box | null;
  /** Empty box rows keep their label centered while it grows. */
  center: boolean;
  centerX: number;
}

const MAX_LINE = 240;

export class TextTool implements Tool {
  cursor: Vector | null = null;
  private lineStart: Vector | null = null;
  /** `layer` mode scratch and history. */
  private layer: Layer | null = null;
  private history: Snapshot[] = [];
  /** `inplace` mode state. */
  private edit: EditSession | null = null;

  constructor(private readonly ctx: ToolContext) {}

  /** A cursor is placed, so printable keys are text, not shortcuts. */
  get editing(): boolean {
    return this.cursor != null;
  }

  start(p: Vector): void {
    if (this.edit || this.layer) {
      this.commit();
    }
    if (this.ctx.textMode === "layer") {
      this.cursor = p;
      this.lineStart = p;
      if (!this.layer) this.layer = new Layer();
      this.ctx.canvas.setScratch(this.layer);
      return;
    }
    this.startInPlace(p);
  }

  move(): void {}

  end(): void {}

  // ---------------------------------------------------------------- inplace

  private startInPlace(p: Vector): void {
    const bounds = this.lineBounds(p);
    const buffer: string[] = [];
    for (let x = bounds.left; x <= bounds.right; x++) {
      buffer.push(this.ctx.canvas.committed.get(new Vector(x, bounds.y)) ?? " ");
    }
    // Trim trailing padding so the cursor naturally sits after the label.
    while (buffer.length > 0 && buffer.at(-1) === " ") buffer.pop();
    const cursor = Math.max(0, Math.min(buffer.length, p.x - bounds.left));
    const empty = buffer.every((ch) => ch === " ");
    const box = bounds.box ? findBox(this.ctx.canvas.committed, p) : null;
    this.edit = {
      ...bounds,
      buffer,
      cursor,
      history: [],
      maxWidth: bounds.box ? Math.max(1, bounds.right - bounds.left + 1) : MAX_LINE,
      box,
      center: box != null && empty,
      centerX: box ? Math.round((box.left() + box.right()) / 2) : p.x,
    };
    this.cursor = p;
    this.lineStart = new Vector(bounds.left, bounds.y);
    this.refreshInPlace();
  }

  /** Column where the label starts; centered labels shift as they grow. */
  private startColumn(edit: EditSession): number {
    if (!edit.center) return edit.left;
    const width = edit.right - edit.left + 1;
    const centered = edit.centerX - Math.floor(edit.buffer.length / 2);
    return Math.max(edit.left, Math.min(edit.right, Math.min(centered, edit.right - edit.buffer.length + 1)));
  }

  private lineBounds(p: Vector): { left: number; right: number; y: number; box: boolean } {
    const committed = this.ctx.canvas.committed;
    const box = findBox(committed, p);
    if (box) {
      return { left: box.left() + 1, right: box.right() - 1, y: p.y, box: true };
    }
    const cells = committed
      .keys()
      .filter((k) => k.y === p.y && isText(committed.get(k)))
      .sort((a, b) => a.x - b.x);
    if (cells.length === 0) return { left: p.x, right: p.x, y: p.y, box: false };
    const groups: Vector[][] = [];
    let group: Vector[] = [];
    for (const c of cells) {
      if (group.length > 0 && c.x - group.at(-1)!.x > 3) {
        groups.push(group);
        group = [];
      }
      group.push(c);
    }
    if (group.length > 0) groups.push(group);
    const chosen =
      groups.find((g) => p.x >= g[0]!.x - 1 && p.x <= g.at(-1)!.x + 1) ??
      groups.reduce((best, g) =>
        Math.abs(g[0]!.x - p.x) < Math.abs(best[0]!.x - p.x) ? g : best,
      );
    return { left: chosen[0]!.x, right: chosen.at(-1)!.x, y: p.y, box: false };
  }

  /** Projects the edit buffer onto the canvas as a minimal diff layer. */
  private refreshInPlace(): void {
    const edit = this.edit;
    if (!edit) return;
    const diff = new Layer();
    const start = this.startColumn(edit);
    const width = Math.max(edit.buffer.length, edit.right - edit.left + 1);
    for (let i = 0; i < width; i++) {
      const p = new Vector(start + i, edit.y);
      const committed = this.ctx.canvas.committed.get(p) ?? "";
      const desired = edit.buffer[i] ?? " ";
      if (desired === " ") {
        if (committed !== "" && committed !== " ") diff.set(p, "");
      } else if (committed !== desired) {
        diff.set(p, desired);
      }
    }
    this.ctx.canvas.setScratch(diff);
    if (this.cursor) this.cursor = new Vector(start + edit.cursor, edit.y);
  }

  private snapshotInPlace(typed: string): void {
    const edit = this.edit;
    if (!edit) return;
    edit.history.push({ buffer: [...edit.buffer], cursor: edit.cursor, typed });
    if (edit.history.length > 500) edit.history.shift();
  }

  private insert(ch: string): void {
    const edit = this.edit;
    if (!edit) return;
    this.snapshotInPlace(ch);
    if (this.ctx.insertMode) {
      if (edit.buffer.length >= edit.maxWidth) {
        if (!this.wrapLine()) return;
        this.insert(ch);
        return;
      }
      if (edit.cursor > edit.buffer.length) edit.buffer.length = edit.cursor;
      edit.buffer.splice(edit.cursor, 0, ch);
      edit.cursor++;
    } else {
      while (edit.buffer.length < edit.cursor) edit.buffer.push(" ");
      if (edit.cursor >= edit.maxWidth) return;
      edit.buffer[edit.cursor] = ch;
      edit.cursor++;
    }
    this.refreshInPlace();
  }

  /** Moves typing to the next empty row inside the box (soft wrap). */
  private wrapLine(): boolean {
    const edit = this.edit;
    const box = edit?.box;
    if (!edit || !box) return false;
    const nextY = edit.y + 1;
    if (nextY > box.bottom() - 1) return false;
    for (let x = box.left() + 1; x <= box.right() - 1; x++) {
      if (isText(this.ctx.canvas.committed.get(new Vector(x, nextY)))) return false;
    }
    const left = box.left() + 1;
    this.flushInPlace();
    this.startInPlace(new Vector(left, nextY));
    if (this.edit) {
      this.edit.center = false;
      this.edit.cursor = 0;
      this.refreshInPlace();
    }
    return true;
  }

  private backspace(): void {
    const edit = this.edit;
    if (!edit) return;
    this.snapshotInPlace("\b");
    if (edit.cursor > 0) {
      edit.cursor--;
      edit.buffer.splice(edit.cursor, 1);
    } else {
      // At the start of a label: pull the previous line into this one.
      edit.buffer.unshift(" ");
      edit.cursor = 0;
    }
    this.refreshInPlace();
  }

  private deleteForward(): void {
    const edit = this.edit;
    if (!edit) return;
    this.snapshotInPlace("\x7f");
    if (edit.cursor < edit.buffer.length) edit.buffer.splice(edit.cursor, 1);
    this.refreshInPlace();
  }

  private moveCursor(dx: number, word = false): void {
    const edit = this.edit;
    if (!edit) return;
    let next = edit.cursor + dx;
    if (word && dx < 0) {
      while (next > 0 && edit.buffer[next - 1] === " ") next--;
      while (next > 0 && edit.buffer[next - 1] !== " ") next--;
    } else if (word && dx > 0) {
      while (next < edit.buffer.length && edit.buffer[next] !== " ") next++;
      while (next < edit.buffer.length && edit.buffer[next] === " ") next++;
    }
    edit.cursor = Math.max(0, Math.min(edit.buffer.length, next));
    this.cursor = new Vector(this.startColumn(edit) + edit.cursor, edit.y);
  }

  /** Commits the current row (one undo step) but keeps a text session alive. */
  private flushInPlace(): void {
    if (!this.edit) return;
    this.ctx.canvas.commitScratch();
    this.edit.history = [];
  }

  private switchLine(y: number, cursorX: number): void {
    const edit = this.edit;
    if (!edit) return;
    this.flushInPlace();
    this.startInPlace(new Vector(edit.left + Math.min(edit.cursor, cursorX), y));
  }

  private handleInPlace(key: string, m: Mods): boolean {
    const edit = this.edit;
    if (!edit) return false;
    switch (key) {
      case KEY.ENTER:
        this.flushInPlace();
        this.startInPlace(new Vector(edit.left, edit.y + 1));
        return true;
      case KEY.BACKSPACE:
        this.backspace();
        return true;
      case KEY.DELETE:
        this.deleteForward();
        return true;
      case KEY.LEFT:
        this.moveCursor(-1, m.ctrl);
        return true;
      case KEY.RIGHT:
        this.moveCursor(1, m.ctrl);
        return true;
      case KEY.UP:
        this.switchLine(edit.y - 1, edit.cursor);
        return true;
      case KEY.DOWN:
        this.switchLine(edit.y + 1, edit.cursor);
        return true;
      case KEY.HOME:
        edit.cursor = 0;
        this.cursor = new Vector(this.startColumn(edit), edit.y);
        return true;
      case KEY.END:
        edit.cursor = edit.buffer.length;
        this.cursor = new Vector(this.startColumn(edit) + edit.cursor, edit.y);
        return true;
    }
    if (!isPlaceable(key)) return false;
    this.insert(transformChar(key, this.ctx.fontStyle));
    return true;
  }

  // ---------------------------------------------------------------- layer (legacy)

  private snapshot(typed: string): void {
    if (!this.layer) return;
    this.history.push({ layer: this.layer.clone(), cursor: this.cursor!, typed });
  }

  private write(p: Vector, value: string): void {
    if (!this.layer) return;
    this.layer = this.layer.clone();
    this.layer.set(p, value);
    this.ctx.canvas.setScratch(this.layer);
  }

  private handleLayer(key: string, m: Mods): boolean {
    if (!this.cursor || !this.layer) return false;
    const c = this.cursor;
    switch (key) {
      case KEY.ENTER:
        this.cursor = new Vector(this.lineStart!.x, c.y + 1);
        return true;
      case KEY.BACKSPACE:
        this.snapshot("\b");
        this.cursor = c.left();
        this.write(this.cursor, " ");
        return true;
      case KEY.DELETE:
        this.snapshot("\x7f");
        this.write(c, " ");
        return true;
      case KEY.LEFT:
        this.cursor = c.left();
        return true;
      case KEY.RIGHT:
        this.cursor = c.right();
        return true;
      case KEY.UP:
        this.cursor = c.up();
        return true;
      case KEY.DOWN:
        this.cursor = c.down();
        return true;
      case KEY.HOME:
        this.cursor = new Vector(this.lineStart!.x, c.y);
        return true;
      case KEY.END:
        this.cursor = new Vector(Math.max(this.lineStart!.x, c.x), c.y);
        return true;
    }
    if (!isPlaceable(key)) return false;
    const placed = transformChar(key, this.ctx.fontStyle);
    this.snapshot(placed);
    this.write(c, placed);
    this.cursor = c.right();
    return true;
  }

  // ---------------------------------------------------------------- shared

  handleKey(key: string, m: Mods = { ctrl: false, alt: false, shift: false, flip: false }): boolean {
    if (this.edit) return this.handleInPlace(key, m);
    return this.handleLayer(key, m);
  }

  /** Undoes the last keystroke of this session. False when there is none. */
  undoKeystroke(): boolean {
    if (this.edit) {
      const snap = this.edit.history.pop();
      if (!snap) return false;
      this.edit.buffer = snap.buffer;
      this.edit.cursor = snap.cursor;
      this.cursor = new Vector(this.edit.left + snap.cursor, this.edit.y);
      this.refreshInPlace();
      return true;
    }
    const snap = this.history.pop();
    if (!snap) return false;
    this.layer = snap.layer;
    this.cursor = snap.cursor;
    this.ctx.canvas.setScratch(this.layer);
    return true;
  }

  /** The most recent keystroke, if it was a typed space (used by space-to-pan). */
  get lastTypedSpace(): boolean {
    if (this.edit) return this.edit.history.at(-1)?.typed === " ";
    return this.history.at(-1)?.typed === " ";
  }

  /** Commits the session as one undo step and removes the cursor. */
  commit(): void {
    if (this.edit) {
      this.ctx.canvas.commitScratch();
      this.edit = null;
    }
    if (this.layer) this.ctx.canvas.commitScratch();
    this.layer = null;
    this.history = [];
    this.cursor = null;
    this.lineStart = null;
  }

  cleanup(): void {
    this.commit();
  }

  hoverHint(): HoverHint {
    return "text";
  }
}
