import { describe, expect, test } from "bun:test";
import { Box } from "../src/core/box";
import { Canvas } from "../src/core/canvas";
import { Editor } from "../src/core/editor";
import { drawBox } from "../src/core/tools/box";
import { Vector } from "../src/core/vector";

describe("SelectTool restyle", () => {
  test("restyleBoxes updates box shape to rounded corners", () => {
    const canvas = new Canvas();
    const editor = new Editor(canvas);
    const box = new Box(new Vector(1, 1), new Vector(5, 4));
    canvas.commit(drawBox(box, { box: "rect", line: "single", arrow: "solid" }));

    // Select the box
    editor.setTool("select");
    editor.select.start(new Vector(1, 1));
    expect(editor.select.hasSelection).toBe(true);
    expect(editor.select.boxes.length).toBe(1);

    // Restyle to rounded
    const ok = editor.select.restyle({ box: "round" });
    expect(ok).toBe(true);
    expect(canvas.committed.get(new Vector(1, 1))).toBe("╭");
    expect(canvas.committed.get(new Vector(5, 1))).toBe("╮");
    expect(canvas.committed.get(new Vector(5, 4))).toBe("╯");
    expect(canvas.committed.get(new Vector(1, 4))).toBe("╰");
  });

  test("restyle updates line style to double and dashed", () => {
    const canvas = new Canvas();
    const editor = new Editor(canvas);
    const box = new Box(new Vector(1, 1), new Vector(5, 4));
    canvas.commit(drawBox(box, { box: "rect", line: "single", arrow: "solid" }));

    editor.setTool("select");
    editor.select.start(new Vector(1, 1));

    // Restyle to double
    editor.select.restyle({ line: "double" });
    expect(canvas.committed.get(new Vector(1, 1))).toBe("╔");
    expect(canvas.committed.get(new Vector(2, 1))).toBe("═");
    expect(canvas.committed.get(new Vector(1, 2))).toBe("║");

    // Restyle to dashed
    editor.select.restyle({ line: "dashed" });
    expect(canvas.committed.get(new Vector(2, 1))).toBe("╌");
    expect(canvas.committed.get(new Vector(1, 2))).toBe("╎");
  });
});
