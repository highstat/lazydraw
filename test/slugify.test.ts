import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Layer } from "../src/core/layer";
import { Vector } from "../src/core/vector";
import {
  DrawingStore,
  deserialize,
  pathForName,
  serialize,
  slugify,
} from "../src/storage/drawings";

describe("slugify", () => {
  test("keeps Cyrillic letters", () => {
    expect(slugify("Схема Архитектуры")).toBe("схема-архитектуры");
    expect(slugify("План 2026")).toBe("план-2026");
  });

  test("keeps other international letters and numbers", () => {
    expect(slugify("Café Überblick")).toBe("café-überblick");
    expect(slugify("日本語 の 図")).toBe("日本語-の-図");
  });

  test("removes punctuation, emoji and path traversal", () => {
    expect(slugify("My diagram! (v2)")).toBe("my-diagram-v2");
    expect(slugify("🚀 rocket")).toBe("rocket");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
  });

  test("falls back to untitled and guards Windows reserved names", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("CON")).toBe("_con");
    expect(slugify("lpt1")).toBe("_lpt1");
  });

  test("caps very long names", () => {
    const slug = slugify("a".repeat(200));
    expect([...slug].length).toBe(80);
  });
});

describe("drawing files", () => {
  test("pathForName uses the international slug", () => {
    expect(pathForName("Схема", "/tmp/drawings")).toEndWith("/tmp/drawings/схема.ld.json");
  });

  test("serialize round-trips cells, including international text", () => {
    const layer = new Layer();
    layer.set(new Vector(0, 0), "П");
    layer.set(new Vector(2, 1), "┌");
    const text = serialize("Схема", layer, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    expect(text).toContain('"name": "Схема"');
    const { file, layer: restored } = deserialize(text);
    expect(file.version).toBe(1);
    expect(file.cells).toEqual([
      [0, 0, "П"],
      [2, 1, "┌"],
    ]);
    expect(restored.get(new Vector(0, 0))).toBe("П");
    expect(restored.get(new Vector(2, 1))).toBe("┌");
  });

  test("store saves, lists, renames and deletes", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazydraw-store-"));
    try {
      const store = new DrawingStore(dir);
      const layer = new Layer();
      layer.set(new Vector(1, 1), "x");
      const path = store.pathFor("Схема");
      store.save(path, "Схема", layer, "2026-01-01T00:00:00.000Z");

      expect(store.exists("схема")).toBe(true);
      const listed = store.list();
      expect(listed.map((d) => d.name)).toEqual(["Схема"]);
      expect(listed[0]?.size).toBe(1);

      const loaded = store.loadSync(path);
      expect(loaded.layer.get(new Vector(1, 1))).toBe("x");

      const renamed = store.rename(path, "Схема 2", layer, "2026-01-01T00:00:00.000Z");
      expect(renamed).toEndWith("схема-2.ld.json");
      expect(store.list().map((d) => d.name)).toEqual(["Схема 2"]);

      store.delete(renamed);
      expect(store.list()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("list sorts by name or recent update", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazydraw-sort-"));
    try {
      const store = new DrawingStore(dir);
      const layer = new Layer();
      const alphaPath = store.pathFor("Alpha");
      const betaPath = store.pathFor("beta");
      writeFileSync(
        alphaPath,
        serialize("Alpha", layer, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
      );
      writeFileSync(
        betaPath,
        serialize("beta", layer, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"),
      );
      expect(store.list("recent").map((d) => d.name)).toEqual(["beta", "Alpha"]);
      expect(store.list("name").map((d) => d.name)).toEqual(["Alpha", "beta"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
