// Smart connectors: route an orthogonal arrow between two boxes, avoiding all
// other boxes, with a turn penalty so paths stay readable.
import { Box } from "./box";
import { findBox } from "./entity";
import { ARROW_HEADS, connectionGlyph, isCorner, isStraight } from "./glyphs";
import { Layer, type LayerView } from "./layer";
import { snap } from "./snap";
import type { DrawStyle } from "./style";
import { Direction, Vector } from "./vector";

export interface Route {
  layer: Layer;
  cells: Vector[];
  glyphs: Map<string, string>;
}

export interface Connector {
  from: Box;
  to: Box;
  cells: Vector[];
  glyphs: Map<string, string>;
}

export const sameBox = (a: Box, b: Box) =>
  a.left() === b.left() && a.right() === b.right() && a.top() === b.top() && a.bottom() === b.bottom();

/** All closed boxes in a drawing, deduplicated and sorted by area. */
export function findBoxes(layer: LayerView): Box[] {
  const found = new Map<string, Box>();
  for (const p of layer.keys()) {
    if (!isCorner(layer.get(p))) continue;
    const box = findBox(layer as Layer, p);
    if (!box) continue;
    found.set(`${box.left()},${box.top()},${box.right()},${box.bottom()}`, box);
  }
  return [...found.values()].sort((a, b) => a.width() * a.height() - b.width() * b.height());
}

const SIDES = [Direction.UP, Direction.RIGHT, Direction.DOWN, Direction.LEFT] as const;

/** A few anchor points along one side, so connectors have room to leave. */
function anchors(box: Box, side: Direction): Vector[] {
  const out: Vector[] = [];
  const add = (x: number, y: number) => {
    const p = new Vector(x, y);
    if (!out.some((q) => q.equals(p))) out.push(p);
  };
  if (side === Direction.UP || side === Direction.DOWN) {
    const y = side === Direction.UP ? box.top() : box.bottom();
    const mid = Math.floor((box.left() + box.right()) / 2);
    add(mid, y);
    add(mid - 2, y);
    add(mid + 2, y);
    add(box.left() + 1, y);
    add(box.right() - 1, y);
  } else {
    const x = side === Direction.LEFT ? box.left() : box.right();
    const mid = Math.floor((box.top() + box.bottom()) / 2);
    add(x, mid);
    add(x, mid - 1);
    add(x, mid + 1);
    add(x, box.top() + 1);
    add(x, box.bottom() - 1);
  }
  return out;
}

interface Node {
  x: number;
  y: number;
  dir: Direction | null;
}

class Heap {
  private data: { score: number; node: Node }[] = [];

  push(score: number, node: Node): void {
    this.data.push({ score, node });
    let i = this.data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent]!.score <= this.data[i]!.score) break;
      [this.data[parent], this.data[i]] = [this.data[i]!, this.data[parent]!];
      i = parent;
    }
  }

  pop(): Node | null {
    const top = this.data[0];
    if (!top) return null;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.data.length && this.data[l]!.score < this.data[best]!.score) best = l;
        if (r < this.data.length && this.data[r]!.score < this.data[best]!.score) best = r;
        if (best === i) break;
        [this.data[best], this.data[i]] = [this.data[i]!, this.data[best]!];
        i = best;
      }
    }
    return top.node;
  }

  get size(): number {
    return this.data.length;
  }
}

const keyOf = (x: number, y: number, d: Direction | null) => `${x},${y},${d?.name ?? "-"}`;

function aStar(
  start: Vector,
  goal: Vector,
  startDir: Direction,
  goalDir: Direction,
  blocked: (p: Vector) => boolean,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): Vector[] | null {
  const heap = new Heap();
  const came = new Map<string, string>();
  const nodes = new Map<string, Node>();
  const startNode: Node = { x: start.x, y: start.y, dir: startDir };
  const startKey = keyOf(start.x, start.y, startDir);
  nodes.set(startKey, startNode);
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  heap.push(h(start.x, start.y), startNode);
  const gScore = new Map<string, number>([[startKey, 0]]);
  let best: { key: string; node: Node } | null = null;
  let bestH = h(start.x, start.y);
  let visited = 0;

  while (heap.size > 0 && visited < 120_000) {
    const current = heap.pop()!;
    visited++;
    const currentKey = keyOf(current.x, current.y, current.dir);
    if (Math.abs(current.x - goal.x) <= 0 && Math.abs(current.y - goal.y) <= 0 && current.dir === goalDir) {
      best = { key: currentKey, node: current };
      break;
    }
    const currentH = h(current.x, current.y);
    if (currentH < bestH) {
      bestH = currentH;
      best = { key: currentKey, node: current };
    }
    const g = gScore.get(currentKey) ?? Infinity;
    for (const dir of Direction.ALL) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (blocked(new Vector(nx, ny))) continue;
      const nextNode: Node = { x: nx, y: ny, dir };
      const nextKey = keyOf(nx, ny, dir);
      const step = 1 + (current.dir != null && current.dir !== dir ? 2.5 : 0);
      const nextG = g + step;
      if (nextG >= (gScore.get(nextKey) ?? Infinity)) continue;
      gScore.set(nextKey, nextG);
      nodes.set(nextKey, nextNode);
      came.set(nextKey, currentKey);
      heap.push(nextG + h(nx, ny), nextNode);
    }
  }

  if (!best) return null;
  // Reconstruct; a near miss is useful only when it is the goal.
  if (best.node.x !== goal.x || best.node.y !== goal.y) return null;
  const path: Vector[] = [];
  let k: string | undefined = best.key;
  while (k) {
    const n = nodes.get(k)!;
    path.push(new Vector(n.x, n.y));
    k = came.get(k);
  }
  return path.reverse();
}

function styleLine(horizontal: boolean, style: DrawStyle): string {
  if (style.line === "double") return horizontal ? "═" : "║";
  if (style.line === "dashed") return horizontal ? "╌" : "╎";
  return horizontal ? "─" : "│";
}

function cornerGlyph(dirs: Direction[], style: DrawStyle): string {
  const hasUp = dirs.includes(Direction.UP);
  const hasDown = dirs.includes(Direction.DOWN);
  const hasLeft = dirs.includes(Direction.LEFT);
  const hasRight = dirs.includes(Direction.RIGHT);
  if (dirs.length === 1) return styleLine(hasLeft || hasRight, style);
  if (dirs.length >= 3) return connectionGlyph(dirs) ?? "┼";
  if ((hasUp && hasDown) || (hasLeft && hasRight)) return styleLine(hasLeft || hasRight, style);
  const double = style.line === "double";
  if (hasUp && hasRight) return double ? "╚" : "└";
  if (hasUp && hasLeft) return double ? "╝" : "┘";
  if (hasDown && hasRight) return double ? "╔" : "┌";
  if (hasDown && hasLeft) return double ? "╗" : "┐";
  return "─";
}

function arrowGlyph(dir: Direction, style: DrawStyle): string {
  const heads = ARROW_HEADS[style.arrow] ?? ARROW_HEADS.solid;
  if (dir === Direction.LEFT) return heads.left;
  if (dir === Direction.RIGHT) return heads.right;
  if (dir === Direction.UP) return heads.up;
  return heads.down;
}

function outOf(p: Vector, q: Vector): Direction | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (dx === 0 && dy === 0) return null;
  return Direction.of(Math.sign(dx), Math.sign(dy));
}

function pathLayer(path: Vector[], targetSide: Direction, style: DrawStyle): Layer {
  const layer = new Layer();
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (i === path.length - 1) {
      layer.set(p, arrowGlyph(targetSide.opposite(), style));
      continue;
    }
    const dirs: Direction[] = [];
    if (i > 0) {
      const d = outOf(p, path[i - 1]!);
      if (d) dirs.push(d);
    }
    if (i === 0) {
      // Start cell also connects into the source box (opposite the outward side).
      const d = outOf(p, path[Math.min(1, path.length - 1)]!);
      if (d) dirs.push(d);
      dirs.push(targetSide); // replaced by caller with the source side below
    } else {
      const d = outOf(p, path[i + 1]!);
      if (d) dirs.push(d);
    }
    layer.set(p, cornerGlyph(dirs, style));
  }
  return layer;
}

interface Candidate {
  fromSide: Direction;
  toSide: Direction;
  start: Vector;
  end: Vector;
  distance: number;
}

/** Routes a connector between two boxes, returning null when no path exists. */
export function routeConnector(layer: Layer, from: Box, to: Box, style: DrawStyle, allBoxes = findBoxes(layer)): Route | null {
  const obstacles = allBoxes.filter((b) => !sameBox(b, from) && !sameBox(b, to));
  const blocked = (p: Vector) => obstacles.some((b) => b.contains(p));
  const candidates: Candidate[] = [];
  for (const fromSide of SIDES) {
    for (const toSide of SIDES) {
      for (const a of anchors(from, fromSide)) {
        const start = a.add(fromSide);
        if (blocked(start)) continue;
        for (const b of anchors(to, toSide)) {
          const end = b.add(toSide);
          if (blocked(end)) continue;
          const distance = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
          candidates.push({ fromSide, toSide, start, end, distance });
        }
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  const minX = Math.min(from.left(), to.left()) - 12;
  const maxX = Math.max(from.right(), to.right()) + 12;
  const minY = Math.min(from.top(), to.top()) - 12;
  const maxY = Math.max(from.bottom(), to.bottom()) + 12;

  for (const c of candidates) {
    // Growing the search box gives paths around large obstacles a chance.
    for (const pad of [0, 12, 32]) {
      const path = aStar(
        c.start,
        c.end,
        c.fromSide,
        c.toSide.opposite(),
        blocked,
        minX - pad,
        maxX + pad,
        minY - pad,
        maxY + pad,
      );
      if (!path) continue;
      const route = pathLayer(path, c.toSide, style);
      // The first cell connects to the source box; draw the straight run into it.
      const first = path[0]!;
      const firstGlyph = cornerGlyph([c.fromSide.opposite(), outOf(first, path[1] ?? first) ?? c.fromSide], style);
      route.set(first, firstGlyph);
      const snapped = snap(route, layer);
      route.setFrom(snapped);
      const cells = route.keys();
      const glyphs = new Map(route.entries().map(([p, v]) => [p.key(), v]));
      return { layer: route, cells, glyphs };
    }
  }
  return null;
}

/** Reroutes every connector attached to a moved box and returns one diff. */
export function reflowConnectors(
  committed: Layer,
  connectors: Connector[],
  from: Box | null,
  to: Box | null,
  style: DrawStyle,
): Layer | null {
  const diff = new Layer();
  let changed = false;
  for (const c of connectors) {
    if (from && to && sameBox(c.from, from)) c.from = to;
    if (from && to && sameBox(c.to, from)) c.to = to;
    // Erase only cells that still hold the connector's own glyphs outside the boxes.
    for (const p of c.cells) {
      if ((from && from.contains(p)) || (to && to.contains(p)) || c.from.contains(p) || c.to.contains(p)) {
        continue;
      }
      const old = c.glyphs.get(p.key());
      if (old != null && committed.get(p) === old) diff.set(p, "");
    }
    const snappedDiff = snap(diff, committed);
    diff.setFrom(snappedDiff);
    const boxes = findBoxes(committed);
    if (!boxes.some((b) => sameBox(b, c.from)) || !boxes.some((b) => sameBox(b, c.to))) continue;
    const route = routeConnector(committed, c.from, c.to, style, boxes);
    if (!route) continue;
    diff.setFrom(route.layer);
    c.cells = route.cells;
    c.glyphs = route.glyphs;
    changed = true;
  }
  return changed ? diff : null;
}
