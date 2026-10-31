import { describe, expect, test } from "bun:test";
import { generateTable } from "../src/core/table.ts";

describe("ASCII table generator", () => {
  test("generates 2x2 single-line table with headers", () => {
    const table = generateTable({ cols: 2, rows: 2, colWidth: 8, lineStyle: "single" });
    const lines = table.split("\n");
    expect(lines.length).toBe(7); // top, header, mid, row1, mid, row2, bottom
    expect(lines[0]).toStartWith("┌");
    expect(lines[0]).toEndWith("┐");
    expect(lines[1]).toContain("Col 1");
    expect(lines[1]).toContain("Col 2");
    expect(lines[2]).toStartWith("├");
    expect(lines[6]).toStartWith("└");
  });

  test("generates double-line and dashed tables", () => {
    const doubleTable = generateTable({ cols: 2, rows: 1, colWidth: 6, lineStyle: "double" });
    expect(doubleTable).toContain("╔");
    expect(doubleTable).toContain("═");
    expect(doubleTable).toContain("╝");

    const dashedTable = generateTable({ cols: 2, rows: 1, colWidth: 6, lineStyle: "dashed" });
    expect(dashedTable).toContain("┌");
    expect(dashedTable).toContain("╌");
  });

  test("can be placed at a specific target position on canvas", () => {
    const { Canvas } = require("../src/core/canvas");
    const { Editor } = require("../src/core/editor");
    const { Vector } = require("../src/core/vector");

    const canvas = new Canvas();
    const editor = new Editor(canvas);
    const table = generateTable({ cols: 2, rows: 2, colWidth: 6, lineStyle: "single" });
    const target = new Vector(15, 25);

    editor.select.paste(table, target);

    // Top-left cell of the table should be at (15, 25)
    expect(canvas.committed.get(target)).toBe("┌");
    expect(editor.select.hasSelection).toBe(true);
    expect(editor.select.selectBox?.topLeft()).toEqual(target);
  });
});

