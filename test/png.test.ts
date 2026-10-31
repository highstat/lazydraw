import { describe, expect, test } from "bun:test";
import { Layer } from "../src/core/layer";
import { Vector } from "../src/core/vector";
import { DEFAULT_EXPORT, exportPng } from "../src/core/export";
import { serialize } from "../src/storage/drawings";

describe("PNG export", () => {
  test("renders layer to valid PNG byte buffer with PNG magic bytes", () => {
    const layer = new Layer();
    layer.set(new Vector(0, 0), "┌");
    layer.set(new Vector(1, 0), "─");
    layer.set(new Vector(2, 0), "┐");
    layer.set(new Vector(0, 1), "│");
    layer.set(new Vector(1, 1), "A");
    layer.set(new Vector(2, 1), "│");
    layer.set(new Vector(0, 2), "└");
    layer.set(new Vector(1, 2), "─");
    layer.set(new Vector(2, 2), "┘");

    const png = exportPng(layer, { ...DEFAULT_EXPORT, format: "png" });
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png.byteLength).toBeGreaterThan(500);

    // PNG Magic Bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // 'P'
    expect(png[2]).toBe(0x4e); // 'N'
    expect(png[3]).toBe(0x47); // 'G'
  });

  test("CLI export --format png exports binary PNG to file", () => {
    const tmpPng = `/tmp/test-cli-export-${Date.now()}.png`;
    const tmpDrawing = `/tmp/test-drawing-${Date.now()}.ld.json`;
    const layer = new Layer();
    layer.set(new Vector(0, 0), "┌");
    layer.set(new Vector(1, 0), "┐");
    layer.set(new Vector(0, 1), "└");
    layer.set(new Vector(1, 1), "┘");
    const now = new Date().toISOString();
    Bun.write(tmpDrawing, serialize("test-box", layer, now, now));

    const proc = Bun.spawnSync([
      process.execPath,
      "run",
      "src/cli.ts",
      "export",
      tmpDrawing,
      "--format",
      "png",
      "-o",
      tmpPng,
    ]);

    expect(proc.exitCode).toBe(0);
    const file = Bun.file(tmpPng);
    expect(file.size).toBeGreaterThan(500);

    // Clean up
    try {
      import("node:fs").then((fs) => {
        fs.unlinkSync(tmpPng);
        fs.unlinkSync(tmpDrawing);
      });
    } catch {}
  });
});
