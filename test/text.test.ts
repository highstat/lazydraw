import { describe, expect, test } from "bun:test";
import { Box } from "../src/core/box";
import { Canvas } from "../src/core/canvas";
import { Editor } from "../src/core/editor";
import { Layer } from "../src/core/layer";
import { layerToText, textSize, textToLayer, transformChar } from "../src/core/text";
import { drawBox, drawBoxStyled } from "../src/core/tools/box";
import { KEY, mods } from "../src/core/tools/tool";
import { Vector } from "../src/core/vector";

const textOf = (layer: Layer) => layerToText(layer, null, true);

describe("text helpers", () => {
  test("textToLayer lays out rows and replaces wide characters", () => {
    const layer = textToLayer("ab\n  cd\n   日本語");
    expect(layer.get(new Vector(0, 0))).toBe("a");
    expect(layer.get(new Vector(1, 0))).toBe("b");
    expect(layer.get(new Vector(0, 1))).toBeNull();
    expect(layer.get(new Vector(2, 1))).toBe("c");
    expect(layer.get(new Vector(3, 2))).toBe("?");
  });

  test("textToLayer applies an offset and expands tabs", () => {
    const layer = textToLayer("\tx", new Vector(3, 4));
    expect(layer.get(new Vector(7, 4))).toBe("x");
  });

  test("layerToText keeps trailing spaces only when requested", () => {
    const layer = new Layer();
    layer.set(new Vector(0, 0), "a");
    layer.set(new Vector(3, 0), "b");
    expect(layerToText(layer)).toBe("a  b");
    expect(layerToText(layer, null, true)).toBe("a  b");
    layer.delete(new Vector(3, 0));
    layer.set(new Vector(1, 0), " ");
    expect(textOf(layer)).toBe("a");
  });

  test("textSize counts columns and lines", () => {
    expect(textSize("ab\ncde")).toEqual(new Vector(3, 2));
    expect(textSize("")).toEqual(new Vector(0, 1));
  });

  test("transformChar applies Unicode stylized fonts", () => {
    expect(transformChar("A", "bold")).toBe("𝐀");
    expect(transformChar("b", "bold")).toBe("𝐛");
    expect(transformChar("5", "bold")).toBe("𝟓");
    expect(transformChar("C", "double")).toBe("ℂ");
    expect(transformChar("x", "double")).toBe("𝕩");
    expect(transformChar("hello", "smallcaps")).toBe("hello"); // non-single char untouched
    expect(transformChar("h", "smallcaps")).toBe("ʜ");
    expect(transformChar("a", "italic")).toBe("𝑎");
    expect(transformChar("A", "normal")).toBe("A");
  });
});

describe("in-place text tool", () => {
  const start = (editor: Editor, p: Vector) => {
    editor.setTool("text");
    editor.down(p, mods());
    editor.up();
  };

  test("types, inserts and deletes on a plain row", () => {
    const editor = new Editor(new Canvas());
    start(editor, new Vector(2, 2));
    for (const ch of "hello") editor.key(ch, mods());
    editor.key(KEY.HOME, mods());
    editor.key(">", mods());
    expect(editor.text.cursor).toEqual(new Vector(3, 2));
    editor.key(KEY.END, mods());
    editor.key(KEY.BACKSPACE, mods());
    editor.flush();
    expect(textOf(editor.canvas.committed)).toBe(">hell");
  });

  test("overwrite mode replaces characters", () => {
    const layer = new Layer();
    layer.set(new Vector(0, 0), "a");
    layer.set(new Vector(1, 0), "b");
    layer.set(new Vector(2, 0), "c");
    const editor = new Editor(new Canvas(layer));
    editor.insertMode = false;
    start(editor, new Vector(1, 0));
    editor.key("X", mods());
    editor.flush();
    expect(textOf(editor.canvas.committed)).toBe("aXc");
  });

  test("ctrl+left/right move by word", () => {
    const editor = new Editor(new Canvas());
    start(editor, new Vector(0, 0));
    for (const ch of "hello world") editor.key(ch, mods());
    editor.key(KEY.LEFT, mods({ ctrl: true }));
    expect(editor.text.cursor).toEqual(new Vector(6, 0));
    editor.key(KEY.LEFT, mods({ ctrl: true }));
    expect(editor.text.cursor).toEqual(new Vector(0, 0));
    editor.key(KEY.RIGHT, mods({ ctrl: true }));
    expect(editor.text.cursor).toEqual(new Vector(6, 0));
  });

  test("labels in an empty box start centered and stay centered while growing", () => {
    const layer = drawBox(new Box(new Vector(0, 0), new Vector(20, 5)));
    const editor = new Editor(new Canvas(layer));
    start(editor, new Vector(10, 2));
    editor.key("h", mods());
    expect(editor.text.cursor).toEqual(new Vector(11, 2));
    editor.key("i", mods());
    // "hi" is centered on column 10: h at 9, i at 10, cursor at 11.
    expect(editor.text.cursor).toEqual(new Vector(11, 2));
    const scratch = editor.canvas.scratch;
    expect(scratch.get(new Vector(9, 2))).toBe("h");
    expect(scratch.get(new Vector(10, 2))).toBe("i");
    editor.flush();
    expect(textOf(editor.canvas.committed)).toContain("hi");
  });

  test("typing past the box width wraps to the next row", () => {
    const layer = drawBox(new Box(new Vector(0, 0), new Vector(6, 4)));
    const editor = new Editor(new Canvas(layer));
    start(editor, new Vector(3, 1));
    for (const ch of "abcdefg") editor.key(ch, mods());
    editor.flush();
    expect(editor.canvas.committed.get(new Vector(1, 1))).toBe("a");
    expect(editor.canvas.committed.get(new Vector(5, 1))).toBe("e");
    expect(editor.canvas.committed.get(new Vector(1, 2))).toBe("f");
    expect(editor.canvas.committed.get(new Vector(2, 2))).toBe("g");
  });

  test("undo removes the last keystroke of the session", () => {
    const editor = new Editor(new Canvas());
    start(editor, new Vector(0, 0));
    editor.key("a", mods());
    editor.key("b", mods());
    expect(editor.undo()).toBe(true);
    expect(editor.canvas.rendered().get(new Vector(0, 0))).toBe("a");
    expect(editor.canvas.rendered().get(new Vector(1, 0))).toBeNull();
  });
});

describe("box drawing", () => {
  test("drawBox supports rounded, double, dashed, diamond, ellipse and cylinder", () => {
    const box = new Box(new Vector(0, 0), new Vector(10, 4));
    const rect = drawBox(box);
    expect(rect.get(new Vector(0, 0))).toBe("┌");
    expect(rect.get(new Vector(10, 0))).toBe("┐");
    expect(rect.get(new Vector(0, 4))).toBe("└");
    expect(rect.get(new Vector(10, 4))).toBe("┘");
    expect(rect.get(new Vector(5, 0))).toBe("─");
    expect(rect.get(new Vector(0, 2))).toBe("│");

    const round = drawBox(box, { line: "single", arrow: "solid", box: "round" });
    expect(round.get(new Vector(0, 0))).toBe("╭");
    expect(round.get(new Vector(10, 4))).toBe("╯");

    const double = drawBox(box, { line: "double", arrow: "solid", box: "rect" });
    expect(double.get(new Vector(0, 0))).toBe("╔");
    expect(double.get(new Vector(5, 0))).toBe("═");
    expect(double.get(new Vector(0, 2))).toBe("║");

    const dashed = drawBox(box, { line: "dashed", arrow: "solid", box: "rect" });
    expect(dashed.get(new Vector(5, 0))).toBe("╌");
    expect(dashed.get(new Vector(0, 2))).toBe("╎");

    const diamond = drawBox(box, { line: "single", arrow: "solid", box: "diamond" });
    expect(diamond.get(new Vector(0, 0))).toBe("◇");

    const ellipse = drawBox(box, { line: "single", arrow: "solid", box: "ellipse" });
    expect(ellipse.get(new Vector(0, 0))).toBe("◜");
    expect(ellipse.get(new Vector(10, 0))).toBe("◝");
    expect(ellipse.get(new Vector(0, 4))).toBe("◟");

    const cylinder = drawBox(box, { line: "single", arrow: "solid", box: "cylinder" });
    expect(cylinder.get(new Vector(5, 0))).toBe("╥");
    expect(cylinder.get(new Vector(5, 4))).toBe("╨");
  });

  test("drawBox handles single-row and single-column boxes", () => {
    const row = drawBox(new Box(new Vector(1, 1), new Vector(4, 1)));
    expect(row.get(new Vector(1, 1))).toBe("─");
    expect(row.get(new Vector(4, 1))).toBe("─");
    const col = drawBox(new Box(new Vector(2, 0), new Vector(2, 3)));
    expect(col.get(new Vector(2, 0))).toBe("│");
  });

  test("drawBoxStyled is an alias", () => {
    expect(drawBoxStyled(new Box(new Vector(0, 0), new Vector(2, 2))).size()).toBe(8);
  });
});
