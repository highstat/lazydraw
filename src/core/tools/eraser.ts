// Freeform eraser: drags a path of erase markers, snapped so adjacent lines detach cleanly.
import { Layer } from "../layer";
import { snap } from "../snap";
import { Vector } from "../vector";
import type { HoverHint, Tool, ToolContext } from "./tool";

export class EraserTool implements Tool {
  private layer: Layer | null = null;

  constructor(private readonly ctx: ToolContext) {}

  get drawing(): boolean {
    return this.layer != null;
  }

  private draw(p: Vector): void {
    if (!this.layer) return;
    const s = Math.max(1, Math.min(15, this.ctx.brushSize));
    const x0 = -Math.floor((s - 1) / 2);
    const x1 = Math.ceil((s - 1) / 2);
    const y0 = -Math.floor((s - 1) / 2);
    const y1 = Math.ceil((s - 1) / 2);
    for (let dy = y0; dy <= y1; dy++) {
      for (let dx = x0; dx <= x1; dx++) this.layer.set(new Vector(p.x + dx, p.y + dy), "");
    }
    const canvas = this.ctx.canvas;
    const scratch = this.layer.clone();
    scratch.setFrom(snap(scratch, canvas.committed));
    canvas.setScratch(scratch);
  }

  start(p: Vector): void {
    this.layer = new Layer();
    this.draw(p);
  }

  move(p: Vector): void {
    this.draw(p);
  }

  end(): void {
    this.layer = null;
    this.ctx.canvas.commitScratch();
  }

  cleanup(): void {
    this.layer = null;
  }

  handleKey(): boolean {
    return false;
  }

  hoverHint(): HoverHint {
    return "crosshair";
  }
}
