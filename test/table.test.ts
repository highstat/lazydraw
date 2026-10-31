import { describe, expect, test } from "bun:test";
import { generateTable } from "../src/core/table";

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
});
