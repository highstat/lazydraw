import { describe, expect, test } from "bun:test";
import { Box } from "../src/core/box";
import { reflowConnectors, findBoxes, routeConnector } from "../src/core/connector";
import { Layer } from "../src/core/layer";
import { DEFAULT_DRAW_STYLE, type DrawStyle } from "../src/core/style";
import { drawBox } from "../src/core/tools/box";
import { Vector } from "../src/core/vector";

const style = (patch: Partial<DrawStyle> = {}): DrawStyle => ({ ...DEFAULT_DRAW_STYLE, ...patch });

function boxesLayer(boxes: Box[], drawStyle = style()): Layer {
  const layer = new Layer();
  for (const box of boxes) layer.setFrom(drawBox(box, drawStyle));
  return layer;
}

const source = new Box(new Vector(0, 0), new Vector(6, 4));
const target = new Box(new Vector(24, 0), new Vector(30, 4));

describe("connectors", () => {
  test("findBoxes finds every closed box, smallest first", () => {
    const layer = boxesLayer([source, target]);
    const found = findBoxes(layer);
    expect(found).toHaveLength(2);
    expect(found[0]?.width()).toBe(source.width());
  });

  test("routes around an obstacle instead of through it", () => {
    const obstacle = new Box(new Vector(12, 0), new Vector(18, 4));
    const layer = boxesLayer([source, target, obstacle]);
    const route = routeConnector(layer, source, target, style());
    expect(route).not.toBeNull();
    expect(route!.cells.length).toBeGreaterThan(10);
    for (const cell of route!.cells) {
      expect(obstacle.contains(cell)).toBe(false);
    }
  });

  test("connectors keep their style glyphs", () => {
    const layer = boxesLayer([source, target]);
    const route = routeConnector(layer, source, target, style({ line: "double", arrow: "ascii" }));
    expect(route).not.toBeNull();
    const glyphs = [...route!.layer.map.values()];
    expect(glyphs.some((g) => g === "═" || g === "║" || g === "╔" || g === "╗" || g === "╚" || g === "╝")).toBe(true);
    expect(glyphs).toContain(">");
  });

  test("returns null when the target is walled in", () => {
    const wall = new Box(new Vector(20, -4), new Vector(34, 8));
    const layer = boxesLayer([source, target, wall]);
    expect(routeConnector(layer, source, target, style())).toBeNull();
  });

  test("reflows a connector after the target box moves", () => {
    const layer = boxesLayer([source, target]);
    const route = routeConnector(layer, source, target, style());
    expect(route).not.toBeNull();
    layer.setFrom(route!.layer);
    const connector = { from: source, to: target, cells: route!.cells, glyphs: route!.glyphs };

    // Move the target down and left, erasing the old border.
    const moved = new Box(new Vector(24, 12), new Vector(30, 16));
    for (let x = target.left(); x <= target.right(); x++) {
      layer.delete(new Vector(x, target.top()));
      layer.delete(new Vector(x, target.bottom()));
    }
    for (let y = target.top(); y <= target.bottom(); y++) {
      layer.delete(new Vector(target.left(), y));
      layer.delete(new Vector(target.right(), y));
    }
    layer.setFrom(drawBox(moved, style()));

    const diff = reflowConnectors(layer, [connector], target, moved, style());
    expect(diff).not.toBeNull();
    layer.setFrom(diff!);
    expect(findBoxes(layer)).toHaveLength(2);
    expect(connector.to).toEqual(moved);
    expect(connector.cells.length).toBeGreaterThan(0);
  });
});
