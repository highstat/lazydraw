// Freehand pencil: interpolates between mouse samples and snaps the stroke into
// the surrounding diagram. Brush size thickens the stroke.
import { UNICODE } from "../glyphs";
import { Layer } from "../layer";
import { line } from "../route";
import { snap } from "../snap";
import { Vector } from "../vector";
import type { HoverHint, Mods, Tool, ToolContext } from "./tool";

function stamp(layer: Layer, p: Vector, value: string, size: number): void {
  const s = Math.max(1, Math.min(15, size));
  const x0 = -Math.floor((s - 1) / 2);
  const x1 = Math.ceil((s - 1) / 2);
  const y0 = -Math.floor((s - 1) / 2);
  const y1 = Math.ceil((s - 1) / 2);
  for (let dy = y0; dy <= y1; dy++) {
    for (let dx = x0; dx <= x1; dx++) layer.set(new Vector(p.x + dx, p.y + dy), value);
  }
}

export class PencilTool implements Tool {
  private layer: Layer | null = null;
  private last: Vector | null = null;
  private previous: Vector | null = null;

  constructor(private readonly ctx: ToolContext) {}

  private paint(p: Vector): void {
    if (!this.layer) return;
    const size = this.ctx.brushSize;
    if (!this.last) {
      stamp(this.layer, p, UNICODE.lineHorizontal, size);
      this.last = p;
      return;
    }
    if (p.equals(this.last)) return;
    const dx = p.x - this.last.x;
    const dy = p.y - this.last.y;
    const horizontalFirst = Math.abs(dx) >= Math.abs(dy);
    this.layer.setFrom(line(this.last, p, horizontalFirst));
    // Thicken the newest segment (not the whole accumulated stroke).
    if (size > 1) stamp(this.layer, p, horizontalFirst ? UNICODE.lineHorizontal : UNICODE.lineVertical, size);
    this.last = p;
    this.previous = p;
    this.refresh();
  }

  private refresh(): void {
    if (!this.layer) return;
    const scratch = this.layer.clone();
    scratch.setFrom(snap(scratch, this.ctx.canvas.committed));
    this.ctx.canvas.setScratch(scratch);
  }

  start(p: Vector): void {
    this.layer = new Layer();
    this.last = null;
    this.previous = null;
    this.paint(p);
    this.refresh();
  }

  move(p: Vector): void {
    if (!this.layer) return;
    this.paint(p);
  }

  end(): void {
    if (!this.layer) return;
    this.layer = null;
    this.last = null;
    this.previous = null;
    this.ctx.canvas.commitScratch();
  }

  cleanup(): void {
    this.layer = null;
    this.last = null;
    this.previous = null;
  }

  handleKey(): boolean {
    return false;
  }

  hoverHint(): HoverHint {
    return "crosshair";
  }
}
