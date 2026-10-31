// Ported from ASCIIFlow (client/draw/box.ts), MIT © Lewis Hemens.
// Adds box shapes and line styles: rounded/double/dashed borders, diamond,
// ellipse and cylinder approximations that still keep box-drawing topology.
import { Box } from "../box";
import { UNICODE } from "../glyphs";
import { Layer } from "../layer";
import { snap } from "../snap";
import { DEFAULT_DRAW_STYLE, type DrawStyle } from "../style";
import { Vector } from "../vector";
import type { HoverHint, Mods, Tool, ToolContext } from "./tool";

const CORNERS = {
  rect: {
    topLeft: UNICODE.cornerTopLeft,
    topRight: UNICODE.cornerTopRight,
    bottomRight: UNICODE.cornerBottomRight,
    bottomLeft: UNICODE.cornerBottomLeft,
  },
  round: { topLeft: "╭", topRight: "╮", bottomRight: "╯", bottomLeft: "╰" },
  double: { topLeft: "╔", topRight: "╗", bottomRight: "╝", bottomLeft: "╚" },
  diamond: { topLeft: "◇", topRight: "◇", bottomRight: "◇", bottomLeft: "◇" },
  ellipse: { topLeft: "◜", topRight: "◝", bottomRight: "◞", bottomLeft: "◟" },
  cylinder: { topLeft: "╭", topRight: "╮", bottomRight: "╯", bottomLeft: "╰" },
} as const;

const LINES = {
  single: { h: UNICODE.lineHorizontal, v: UNICODE.lineVertical },
  double: { h: "═", v: "║" },
  dashed: { h: "╌", v: "╎" },
} as const;

/** Draws a box outline in the configured shape and line style. */
export function drawBox(box: Box, style: DrawStyle = DEFAULT_DRAW_STYLE): Layer {
  const layer = new Layer();
  const corners =
    style.box === "rect" && style.line === "double" ? CORNERS.double : CORNERS[style.box] ?? CORNERS.rect;
  const lines = LINES[style.line] ?? LINES.single;

  if (box.right() !== box.left()) {
    for (let x = box.left(); x <= box.right(); x++) {
      layer.set(new Vector(x, box.top()), lines.h);
      layer.set(new Vector(x, box.bottom()), lines.h);
    }
  }
  if (box.top() !== box.bottom()) {
    for (let y = box.top(); y <= box.bottom(); y++) {
      layer.set(new Vector(box.left(), y), lines.v);
      layer.set(new Vector(box.right(), y), lines.v);
    }
  }
  if (box.left() !== box.right() && box.top() !== box.bottom()) {
    layer.set(box.topLeft(), corners.topLeft);
    layer.set(box.topRight(), corners.topRight);
    layer.set(box.bottomRight(), corners.bottomRight);
    layer.set(box.bottomLeft(), corners.bottomLeft);
    // A cylinder has a lip: mark the middle of the top and bottom edges.
    if (style.box === "cylinder" && box.width() >= 5) {
      const mid = box.left() + Math.floor(box.width() / 2);
      layer.set(new Vector(mid, box.top()), "╥");
      layer.set(new Vector(mid, box.bottom()), "╨");
    }
  }
  return layer;
}

/** Alias used by the select tool when resizing. */
export const drawBoxStyled = drawBox;

export class BoxTool implements Tool {
  private startPosition: Vector | null = null;

  constructor(private readonly ctx: ToolContext) {}

  start(p: Vector): void {
    this.startPosition = p;
  }

  move(p: Vector): void {
    if (!this.startPosition) return;
    const canvas = this.ctx.canvas;
    const layer = drawBox(new Box(this.startPosition, p), this.ctx.style);
    layer.setFrom(snap(layer, canvas.committed));
    canvas.setScratch(layer);
  }

  end(): void {
    this.startPosition = null;
    this.ctx.canvas.commitScratch();
  }

  cleanup(): void {
    this.startPosition = null;
  }

  handleKey(): boolean {
    return false;
  }

  hoverHint(_p: Vector, _m: Mods): HoverHint {
    return "crosshair";
  }
}
