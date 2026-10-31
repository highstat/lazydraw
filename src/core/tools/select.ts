// Entity-aware select & move tool.
// Ported from ASCIIFlow (client/draw/select.ts), MIT © Lewis Hemens, plus
// lazydraw's keyboard nudge, resize, multi-selection, alignment and clipboard.
import { Box, boundingBox } from "../box";
import { isBoxDrawing } from "../glyphs";
import {
  type BoxAttachment,
  cellsInBox,
  detectLineTip,
  detectWord,
  findBox,
  moveBoxWithAttachments,
  moveCells,
  traceBoxAttachments,
  traceLineFromTip,
} from "../entity";
import { Layer, StackedLayers } from "../layer";
import { arrowFor, connectEndpoints, line } from "../route";
import { snap } from "../snap";
import { layerToText, textToLayer } from "../text";
import { Vector } from "../vector";
import { drawBoxStyled } from "./box";
import { MoveTool } from "./move";
import { KEY, type HoverHint, type Mods, type Tool, type ToolContext } from "./tool";

interface LineReshape {
  cells: Vector[];
  anchor: Vector;
  isArrow: boolean;
  horizontalSegment: boolean;
  moved: boolean;
}

interface Group {
  cells: Vector[];
  box: Box;
  /** A whole box (or box-like rubber band), so attached lines reflow. */
  isBox: boolean;
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

const NUDGE: Record<string, Vector> = {
  [KEY.UP]: new Vector(0, -1),
  [KEY.DOWN]: new Vector(0, 1),
  [KEY.LEFT]: new Vector(-1, 0),
  [KEY.RIGHT]: new Vector(1, 0),
};

function dedupe(cells: Vector[]): Vector[] {
  const seen = new Set<string>();
  return cells.filter((c) => !seen.has(c.key()) && (seen.add(c.key()), true));
}

const translateCells = (cells: Vector[], d: Vector) => cells.map((c) => c.add(d));

export class SelectTool implements Tool {
  selectBox: Box | null = null;
  private selectedCells: Vector[] = [];
  private groups: Group[] = [];
  private selecting = false;
  private additiveSelect = false;
  private selectAnchor: Vector | null = null;
  private dragStart: Vector | null = null;
  private dragEnd: Vector | null = null;
  private moveTool: MoveTool | null = null;
  private lineReshape: LineReshape | null = null;
  private activeBox: Box | null = null;
  private attachments: BoxAttachment[] = [];

  constructor(private readonly ctx: ToolContext) {}

  private get canvas() {
    return this.ctx.canvas;
  }

  get hasSelection(): boolean {
    return this.selectedCells.length > 0 && this.canvas.selection != null;
  }

  get groupCount(): number {
    return this.groups.length;
  }

  get boxes(): readonly Box[] {
    return this.groups.filter((g) => g.isBox).map((g) => g.box);
  }

  start(p: Vector, m: Mods = { ctrl: false, alt: false, shift: false, flip: false }): void {
    const committed = this.canvas.committed;
    const value = committed.get(p);

    if (this.selectedCells.length > 0 && this.inSelection(p)) {
      this.beginDrag(p);
      return;
    }

    const tip = detectLineTip(committed, p);
    if (tip) {
      const { cells, anchor } = traceLineFromTip(committed, tip.tip, tip.bodyDir);
      this.lineReshape = {
        cells,
        anchor,
        isArrow: tip.arrow != null,
        horizontalSegment: tip.axis === "horizontal",
        moved: false,
      };
      return;
    }

    const word = detectWord(committed, p);
    if (word) {
      const box = boundingBox(word)!;
      if (m.shift) {
        this.addGroup(word, box, false);
        return;
      }
      this.setSelection(word);
      this.beginDrag(p);
      return;
    }

    if (isBoxDrawing(value)) {
      const box = findBox(committed, p);
      if (box && m.shift) {
        this.addGroup(cellsInBox(committed, box), box, true);
        return;
      }
      this.moveTool = new MoveTool(this.ctx);
      this.moveTool.start(p);
      return;
    }

    const box = findBox(committed, p);
    if (box) {
      if (m.shift) {
        this.addGroup(cellsInBox(committed, box), box, true);
        return;
      }
      this.setSelection(cellsInBox(committed, box), false, box);
      this.beginDrag(p);
      return;
    }

    this.startSelect(p, m.shift);
  }

  move(p: Vector, m: Mods): void {
    if (this.lineReshape) this.reshapeTip(p, m);
    else if (this.dragStart) this.moveDrag(p);
    else if (this.moveTool) this.moveTool.move(p);
    else if (this.selecting) this.moveSelect(p);
  }

  end(): void {
    if (this.lineReshape) {
      if (this.lineReshape.moved) this.canvas.commitScratch();
      else this.canvas.clearScratch();
      this.lineReshape = null;
    } else if (this.dragStart && this.dragEnd) {
      const delta = this.dragEnd.subtract(this.dragStart);
      const oldBox = this.activeBox;
      this.canvas.commitScratch();
      if (oldBox) {
        const moved = oldBox.translate(delta);
        this.groups = [{ cells: cellsInBox(this.canvas.committed, moved), box: moved, isBox: true }];
        this.selectedCells = this.groups[0]!.cells;
        this.selectBox = moved;
        this.activeBox = moved;
        this.canvas.setSelection(moved);
        this.ctx.boxMoved?.(oldBox, moved);
      } else {
        this.groups = this.groups.map((g) => {
          const box = g.box.translate(delta);
          return { ...g, cells: translateCells(g.cells, delta), box };
        });
        this.recomputeSelection(true);
      }
    } else if (this.moveTool) {
      this.moveTool.end();
      this.moveTool = null;
    } else if (this.selecting) {
      this.finishSelect();
    }
    this.dragStart = null;
    this.dragEnd = null;
    this.selecting = false;
  }

  private setSelection(cells: Vector[], keepScratch = false, box: Box | null = null): void {
    const unique = dedupe(cells);
    const bounds = box ?? boundingBox(unique);
    this.selectedCells = unique;
    this.groups = bounds ? [{ cells: unique, box: bounds, isBox: box != null }] : [];
    this.selectBox = bounds;
    this.activeBox = box;
    if (!keepScratch) this.canvas.clearScratch();
    this.canvas.setSelection(bounds);
  }

  /** Adds (or removes) a group under shift+click. */
  private addGroup(cells: Vector[], box: Box, isBox: boolean): void {
    const existing = this.groups.findIndex(
      (g) => g.isBox === isBox && g.box.left() === box.left() && g.box.top() === box.top() && g.box.right() === box.right() && g.box.bottom() === box.bottom(),
    );
    if (existing >= 0) this.groups.splice(existing, 1);
    else this.groups.push({ cells: dedupe(cells), box, isBox });
    this.recomputeSelection(false);
  }

  private recomputeSelection(keepScratch: boolean): void {
    const cells: Vector[] = [];
    for (const g of this.groups) cells.push(...g.cells);
    this.selectedCells = dedupe(cells);
    this.selectBox = boundingBox(this.selectedCells);
    this.activeBox = this.groups.length === 1 && this.groups[0]!.isBox ? this.groups[0]!.box : null;
    if (!keepScratch) this.canvas.clearScratch();
    this.canvas.setSelection(this.selectBox);
  }

  private inSelection(p: Vector): boolean {
    return this.selectBox != null && this.canvas.selection != null && this.selectBox.contains(p);
  }

  private startSelect(p: Vector, additive: boolean): void {
    this.selecting = true;
    this.additiveSelect = additive;
    this.selectAnchor = p;
    this.selectBox = new Box(p, p);
    if (!additive) {
      this.selectedCells = [];
      this.groups = [];
    }
    this.activeBox = null;
    this.canvas.setSelection(this.selectBox);
  }

  private moveSelect(p: Vector): void {
    this.selectBox = new Box(this.selectAnchor!, p);
    this.canvas.setSelection(this.selectBox);
  }

  private finishSelect(): void {
    const box = this.selectBox!;
    const cells = cellsInBox(this.canvas.committed, box);
    if (this.additiveSelect) {
      this.addGroup(cells, box, true);
      this.additiveSelect = false;
      return;
    }
    // A rubber-band selection moves like a box: lines crossing its edge reflow.
    this.setSelection(cells, false, box);
  }

  private beginDrag(p: Vector): void {
    this.dragStart = p;
    this.dragEnd = p;
    this.attachments = this.activeBox ? traceBoxAttachments(this.canvas.committed, this.activeBox) : [];
  }

  private moveDrag(p: Vector): void {
    this.dragEnd = p;
    const delta = p.subtract(this.dragStart!);
    const committed = this.canvas.committed;
    if (this.activeBox) {
      this.canvas.setScratch(moveBoxWithAttachments(committed, this.activeBox, this.attachments, delta));
      this.canvas.setSelection(this.activeBox.translate(delta));
    } else {
      this.canvas.setScratch(moveCells(committed, this.selectedCells, delta));
      this.canvas.setSelection(boundingBox(this.selectedCells.map((c) => c.add(delta))));
    }
  }

  private reshapeTip(target: Vector, m: Mods): void {
    const r = this.lineReshape!;
    r.moved = true;
    const base = this.canvas.committed.clone();
    for (const c of r.cells) base.delete(c);

    const layer = new Layer();
    for (const c of r.cells) layer.set(c, "");

    if (!r.anchor.equals(target)) {
      // Leave the pivot along the line's axis, then bend toward the cursor.
      const horizontalFirst = r.horizontalSegment !== m.flip;
      layer.setFrom(line(r.anchor, target, horizontalFirst));
      if (r.isArrow) layer.set(target, arrowFor(r.anchor, target, horizontalFirst));
      connectEndpoints(layer, base, r.isArrow ? [r.anchor] : [r.anchor, target]);
    }

    layer.setFrom(snap(layer, base));
    this.canvas.setScratch(layer);
    this.canvas.clearSelection();
  }

  hoverHint(p: Vector): HoverHint {
    const committed = this.canvas.committed;
    if (this.selectedCells.length > 0 && this.inSelection(p)) return "move";
    if (detectLineTip(committed, p)) return "crosshair";
    if (detectWord(committed, p)) return "move";
    if (isBoxDrawing(committed.get(p))) return new MoveTool(this.ctx).hoverHint(p);
    if (findBox(committed, p)) return "move";
    return "default";
  }

  /** Every non-empty cell in the drawing. */
  selectAll(): void {
    const cells = this.canvas.committed.keys().filter((k) => !this.cellsAreErase(k));
    this.setSelection(cells);
  }

  private cellsAreErase(p: Vector): boolean {
    const v = this.canvas.committed.get(p);
    return v == null || v === "" || v === " ";
  }

  /** Copies the selection offset by (2,1) and selects the copy. */
  duplicate(offset = new Vector(2, 1)): boolean {
    if (this.selectedCells.length === 0) return false;
    const layer = new Layer();
    const placed: Vector[] = [];
    for (const c of this.selectedCells) {
      const v = this.canvas.committed.get(c);
      if (v == null || v === "" || v === " ") continue;
      const to = c.add(offset);
      layer.set(to, v);
      placed.push(to);
    }
    if (placed.length === 0) return false;
    layer.setFrom(snap(layer, this.canvas.committed));
    if (!this.canvas.commit(layer)) return false;
    this.setSelection(placed);
    return true;
  }

  /** Text of the current selection, or null. */
  copySelection(): string | null {
    if (!this.selectBox || !this.canvas.selection) return null;
    const cells = this.selectionLayer();
    return cells ? layerToText(new StackedLayers([cells]), this.selectBox) : null;
  }

  /** A layer containing just the selected cells, or null. */
  selectionLayer(): Layer | null {
    if (!this.selectBox || !this.canvas.selection || this.selectedCells.length === 0) return null;
    const cells = new Layer();
    for (const c of this.selectedCells) {
      const v = this.canvas.committed.get(c);
      if (v) cells.set(c, v);
    }
    return cells.size() > 0 ? cells : null;
  }

  /** Erases the selected content as one undo step. */
  eraseSelection(): boolean {
    if (this.selectedCells.length === 0) return false;
    const layer = new Layer();
    for (const c of this.selectedCells) layer.set(c, "");
    layer.setFrom(snap(layer, this.canvas.committed));
    const changed = this.canvas.commit(layer);
    this.selectedCells = [];
    this.groups = [];
    this.selectBox = null;
    this.activeBox = null;
    this.canvas.clearSelection();
    return changed;
  }

  /** Pastes text with its top-left at `at`, committed, and selects it. */
  paste(text: string, at: Vector): void {
    const pasted = textToLayer(text, at);
    if (pasted.size() === 0) return;
    const layer = pasted.clone();
    layer.setFrom(snap(pasted, this.canvas.committed));
    this.canvas.commit(layer);
    this.setSelection(pasted.keys());
  }

  // ---------------------------------------------------------------- resize

  private resizeSelection(key: string, m: Mods): boolean {
    const box = this.activeBox;
    if (!box) return false;
    let left = box.left();
    let right = box.right();
    let top = box.top();
    let bottom = box.bottom();
    const grow = !m.ctrl;
    if (key === KEY.LEFT) {
      if (grow) left--;
      else left++;
    } else if (key === KEY.RIGHT) {
      if (grow) right++;
      else right--;
    } else if (key === KEY.UP) {
      if (grow) top--;
      else top++;
    } else if (key === KEY.DOWN) {
      if (grow) bottom++;
      else bottom--;
    } else {
      return false;
    }
    if (right - left < 1 || bottom - top < 1) return true;
    const next = new Box(new Vector(left, top), new Vector(right, bottom));
    const layer = new Layer();
    // Remove the old border where it is no longer part of the box.
    for (let x = box.left(); x <= box.right(); x++) {
      for (const y of [box.top(), box.bottom()]) {
        const p = new Vector(x, y);
        if (!next.contains(p) || !isBoxDrawing(this.canvas.committed.get(p))) layer.set(p, "");
      }
    }
    for (let y = box.top(); y <= box.bottom(); y++) {
      for (const x of [box.left(), box.right()]) {
        const p = new Vector(x, y);
        if (!next.contains(p) || !isBoxDrawing(this.canvas.committed.get(p))) layer.set(p, "");
      }
    }
    layer.setFrom(drawBoxStyled(next, this.ctx.style));
    layer.setFrom(snap(layer, this.canvas.committed));
    if (!this.canvas.commit(layer)) return true;
    this.groups = [{ cells: cellsInBox(this.canvas.committed, next), box: next, isBox: true }];
    this.selectedCells = this.groups[0]!.cells;
    this.selectBox = next;
    this.activeBox = next;
    this.canvas.setSelection(next);
    this.ctx.boxMoved?.(box, next);
    return true;
  }

  // ---------------------------------------------------------------- align

  /** Aligns 2+ selected boxes; returns false when there is nothing to align. */
  align(mode: AlignMode): boolean {
    const boxes = this.groups.filter((g) => g.isBox);
    if (boxes.length < 2) return false;
    const left = Math.min(...boxes.map((g) => g.box.left()));
    const right = Math.max(...boxes.map((g) => g.box.right()));
    const top = Math.min(...boxes.map((g) => g.box.top()));
    const bottom = Math.max(...boxes.map((g) => g.box.bottom()));
    const centerX = Math.round((left + right) / 2);
    const centerY = Math.round((top + bottom) / 2);
    return this.applyGroupDeltas(
      boxes.map((g) => {
        let dx = 0;
        let dy = 0;
        switch (mode) {
          case "left":
            dx = left - g.box.left();
            break;
          case "right":
            dx = right - g.box.right();
            break;
          case "center":
            dx = centerX - Math.round((g.box.left() + g.box.right()) / 2);
            break;
          case "top":
            dy = top - g.box.top();
            break;
          case "bottom":
            dy = bottom - g.box.bottom();
            break;
          case "middle":
            dy = centerY - Math.round((g.box.top() + g.box.bottom()) / 2);
            break;
        }
        return new Vector(dx, dy);
      }),
    );
  }

  /** Spreads 2+ selected boxes evenly between the outermost two. */
  distribute(axis: DistributeAxis): boolean {
    const groups = this.groups.filter((g) => g.isBox);
    if (groups.length < 3) return false;
    const horizontal = axis === "horizontal";
    const sorted = [...groups].sort((a, b) =>
      horizontal ? a.box.left() - b.box.left() : a.box.top() - b.box.top(),
    );
    const first = sorted[0]!;
    const last = sorted.at(-1)!;
    const span = horizontal ? last.box.left() - first.box.left() : last.box.top() - first.box.top();
    const sizes = sorted.map((g) => (horizontal ? g.box.width() : g.box.height()));
    const gap = (span - sizes.reduce((a, b) => a + b, 0)) / (sorted.length - 1);
    let cursor = horizontal ? first.box.left() : first.box.top();
    const deltas = new Map<Group, Vector>();
    sorted.forEach((g, i) => {
      const target = i === 0 || i === sorted.length - 1 ? (i === 0 ? cursor : span + (horizontal ? first.box.left() : first.box.top())) : Math.round(cursor);
      const delta = target - (horizontal ? g.box.left() : g.box.top());
      deltas.set(g, horizontal ? new Vector(delta, 0) : new Vector(0, delta));
      cursor += sizes[i]! + gap;
    });
    return this.applyGroupDeltas(groups.map((g) => deltas.get(g) ?? new Vector(0, 0)));
  }

  private applyGroupDeltas(deltas: Vector[]): boolean {
    const boxes = this.groups.filter((g) => g.isBox);
    if (boxes.length !== deltas.length) return false;
    const combined = new Layer();
    boxes.forEach((g, i) => {
      const d = deltas[i]!;
      if (d.x === 0 && d.y === 0) return;
      combined.setFrom(moveCells(this.canvas.committed, g.cells, d));
    });
    if (combined.size() === 0) return false;
    if (!this.canvas.commit(combined)) return false;
    const moved = new Map<Group, Group>();
    boxes.forEach((g, i) => {
      const d = deltas[i]!;
      const box = g.box.translate(d);
      moved.set(g, { ...g, cells: cellsInBox(this.canvas.committed, box), box });
    });
    this.groups = this.groups.map((g) => moved.get(g) ?? g);
    this.recomputeSelection(true);
    return true;
  }

  handleKey(key: string, m: Mods = { ctrl: false, alt: false, shift: false, flip: false }): boolean {
    if (key === KEY.BACKSPACE || key === KEY.DELETE) {
      return this.eraseSelection();
    }
    if (m.shift && this.hasSelection && !this.dragStart && !this.selecting) {
      if (this.resizeSelection(key, m)) return true;
    }
    const delta = NUDGE[key];
    if (delta && this.hasSelection && !this.dragStart && !this.selecting) {
      const from = this.selectBox!.topLeft();
      this.beginDrag(from);
      this.moveDrag(from.add(delta));
      this.end();
      return true;
    }
    return false;
  }

  /** Switching away drops the selection and any in-progress state. */
  cleanup(): void {
    this.selectedCells = [];
    this.groups = [];
    this.selectBox = null;
    this.activeBox = null;
    this.attachments = [];
    this.lineReshape = null;
    this.moveTool = null;
    this.dragStart = null;
    this.dragEnd = null;
    this.selecting = false;
    this.canvas.clearSelection();
    this.canvas.clearScratch();
  }
}
