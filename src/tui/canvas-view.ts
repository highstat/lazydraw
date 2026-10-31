// Canvas compositing (§3.4): grid, committed, scratch, selection, text cursor, hover.
import { boundingBox } from "../core/box";
import type { Editor } from "../core/editor";
import { isErase } from "../core/layer";
import type { HoverHint } from "../core/tools/tool";
import { Vector } from "../core/vector";
import type { GridStyle } from "../storage/config";
import { ATTR, type Painter } from "./painter";

/** Canvas cell shown at screen (0, 0). */
export class Viewport {
  origin = new Vector(0, 0);

  toCanvas(sx: number, sy: number): Vector {
    return new Vector(sx + this.origin.x, sy + this.origin.y);
  }

  pan(dx: number, dy: number): void {
    this.origin = new Vector(this.origin.x + dx, this.origin.y + dy);
  }

  /** Centers the drawing; large drawings align to the top-left below the toolbar. */
  recenter(editor: Editor, width: number, height: number, top: number): void {
    const box = boundingBox(editor.canvas.committed.keys());
    const availH = height - top - 1;
    if (!box) {
      this.origin = new Vector(-2, -top);
      return;
    }
    const ox = box.width() <= width - 4 ? box.left() - Math.floor((width - box.width()) / 2) : box.left() - 2;
    const oy =
      box.height() <= availH ? box.top() - top - Math.floor((availH - box.height()) / 2) : box.top() - top;
    this.origin = new Vector(ox, oy);
  }
}

export interface CanvasViewState {
  editor: Editor;
  viewport: Viewport;
  grid: GridStyle;
  hoverCell: Vector | null;
  hoverHint: HoverHint;
  /** Blink phase for the text cursor. */
  cursorOn: boolean;
}

export function renderCanvas(p: Painter, s: CanvasViewState): void {
  const { pal } = p;
  const { canvas } = s.editor;
  const committed = canvas.committed.map;
  const scratch = canvas.scratch.map;
  const sel = canvas.selection;
  const { x: ox, y: oy } = s.viewport.origin;
  const maxX = p.width - 1;
  const maxY = p.height - 1;
  const highlightHover =
    s.hoverCell != null && s.editor.tool === "select" && !s.editor.drawing && s.hoverHint !== "default";
  const hoverX = s.hoverCell?.x ?? Number.NaN;
  const hoverY = s.hoverCell?.y ?? Number.NaN;

  /** Grid/background decoration for one screen cell. */
  const base = (sx: number, sy: number, cx: number, cy: number): void => {
    switch (s.grid) {
      case "lattice":
        // U+1FB7C: left and bottom hairlines in one glyph. Terminals draw it flush with the cell edges, unlike an underline.
        p.buf.setCell(sx, sy, "\u{1FB7C}", pal.grid, pal.bg, 0);
        return;
      case "checker":
        p.buf.setCell(sx, sy, " ", pal.fg, (cx + cy) & 1 ? pal.bgAlt : pal.bg, 0);
        return;
      case "dots":
        p.buf.setCell(sx, sy, "·", pal.grid, pal.bg, 0);
        return;
      default:
        p.buf.setCell(sx, sy, " ", pal.fg, pal.bg, 0);
    }
  };

  // Pass 1: fill just the visible screen with background/grid. No map lookups.
  for (let sy = 0; sy <= maxY; sy++) {
    const cy = sy + oy;
    for (let sx = 0; sx <= maxX; sx++) base(sx, sy, sx + ox, cy);
  }

  /** Draws one sparse layer's visible cells; `scratch` paints its highlight background. */
  const drawLayer = (map: Map<string, string>, isScratch: boolean): void => {
    for (const [key, value] of map) {
      const comma = key.indexOf(",");
      const cx = Number(key.slice(0, comma));
      const cy = Number(key.slice(comma + 1));
      const sx = cx - ox;
      const sy = cy - oy;
      if (sx < 0 || sy < 0 || sx > maxX || sy > maxY) continue;
      const erase = isErase(value);
      if (!isScratch && erase) continue;
      if (isScratch && erase) {
        // Erase marker over committed/grid: blank with the scratch highlight.
        const inSel = sel != null && cx >= sel.left() && cx <= sel.right() && cy >= sel.top() && cy <= sel.bottom();
        p.buf.setCell(sx, sy, " ", pal.fg, inSel ? pal.selectionBg : pal.highlight, 0);
        continue;
      }
      const inSel = sel != null && cx >= sel.left() && cx <= sel.right() && cy >= sel.top() && cy <= sel.bottom();
      const bg = inSel ? pal.selectionBg : isScratch ? pal.highlight : pal.bg;
      const fg = isScratch ? pal.scratch : pal.fg;
      const attr = highlightHover && cx === hoverX && cy === hoverY ? ATTR.INVERSE : 0;
      p.buf.setCell(sx, sy, value, fg, bg, attr);
    }
  };

  // Selection background first, then the chars that sit on top of it.
  if (sel) {
    const left = Math.max(0, sel.left() - ox);
    const right = Math.min(maxX, sel.right() - ox);
    const top = Math.max(0, sel.top() - oy);
    const bottom = Math.min(maxY, sel.bottom() - oy);
    for (let sy = top; sy <= bottom; sy++) {
      for (let sx = left; sx <= right; sx++) p.buf.setCell(sx, sy, " ", pal.fg, pal.selectionBg, 0);
    }
  }

  drawLayer(committed, false);
  drawLayer(scratch, true);

  // Dimensions label while dragging structure (ASCIIFlow shows W×H).
  const tool = s.editor.tool;
  if (s.editor.drawing && canvas.scratch.size() > 0 && tool !== "text" && tool !== "eraser") {
    const box = boundingBox(canvas.scratch.keys());
    if (box) {
      const label = `${box.width()}×${box.height()}`;
      p.text(box.right() + 1 - ox, box.bottom() + 1 - oy, label, pal.bg, pal.selectionBg);
    }
  }

  // Text cursor: reverse video.
  const cursor = s.editor.tool === "text" ? s.editor.text.cursor : null;
  if (cursor && s.cursorOn) {
    const sx = cursor.x - ox;
    const sy = cursor.y - oy;
    if (sx >= 0 && sy >= 0 && sx <= maxX && sy <= maxY) {
      const v = canvas.rendered().get(cursor) ?? " ";
      p.buf.setCell(sx, sy, v, pal.fg, pal.bg, ATTR.INVERSE);
    }
  }
}
