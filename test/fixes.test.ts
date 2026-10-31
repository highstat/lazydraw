import { describe, expect, test } from "bun:test";
import type { KeyEvent } from "@opentui/core";
import { Canvas } from "../src/core/canvas";
import { Editor } from "../src/core/editor";
import { TextTool } from "../src/core/tools/text";
import { Vector } from "../src/core/vector";
import { normalizeKeyEvent } from "../src/tui/input";
import { commandMatches } from "../src/tui/commands";
import { PRIMARY_THEMES, THEME_CHOICES } from "../src/storage/config";
import { DEFAULT_DRAW_STYLE } from "../src/core/style";

const rawKey = (sequence: string): KeyEvent =>
  ({
    name: "",
    sequence,
    raw: sequence,
    eventType: "press",
    source: "raw",
    number: false,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
  } as unknown as KeyEvent);

describe("Kitty keyboard and Command+Z normalization", () => {
  test("normalizes Kitty CSI u Cmd+Z sequence \\x1b[122;9u to name 'z' with super/meta", () => {
    const k = normalizeKeyEvent(rawKey("\x1b[122;9u"));
    expect(k.name).toBe("z");
    expect(k.super).toBe(true);
    expect(commandMatches(k, "app:undo")).toBe(true);
  });

  test("normalizes Kitty CSI u Shift+Cmd+Z sequence \\x1b[122;10u to Redo", () => {
    const k = normalizeKeyEvent(rawKey("\x1b[122;10u"));
    expect(k.name).toBe("z");
    expect(k.shift).toBe(true);
    expect(k.super).toBe(true);
    expect(commandMatches(k, "app:redo")).toBe(true);
  });
});

describe("Text tool does not discard typed text on exit / move", () => {
  test("typing text at pos A and then starting at pos B commits pos A", () => {
    const canvas = new Canvas();
    const ctx = {
      canvas,
      textMode: "inplace" as const,
      fontStyle: "normal" as const,
      insertMode: true,
      smartConnectors: true,
      lineStyle: "single" as const,
      arrowStyle: "single" as const,
      boxShape: "rect" as const,
      brushSize: 1,
      style: DEFAULT_DRAW_STYLE,
    };
    const tool = new TextTool(ctx);

    // Click at (10, 5) and type "HELLO"
    tool.start(new Vector(10, 5));
    for (const ch of "HELLO") {
      tool.handleKey(ch);
    }

    // Now click at (20, 5) WITHOUT pressing enter
    tool.start(new Vector(20, 5));

    // The text at (10, 5) should be saved in canvas.committed!
    expect(canvas.committed.get(new Vector(10, 5))).toBe("H");
    expect(canvas.committed.get(new Vector(11, 5))).toBe("E");
    expect(canvas.committed.get(new Vector(12, 5))).toBe("L");
    expect(canvas.committed.get(new Vector(13, 5))).toBe("L");
    expect(canvas.committed.get(new Vector(14, 5))).toBe("O");
  });

  test("switching tool via Editor.setTool commits uncommitted text", () => {
    const canvas = new Canvas();
    const editor = new Editor(canvas);

    editor.setTool("text");
    editor.down(new Vector(5, 5), { ctrl: false, alt: false, shift: false, flip: false });
    editor.up();

    for (const ch of "TEST") {
      editor.key(ch, { ctrl: false, alt: false, shift: false, flip: false });
    }

    // Switch tool to box
    editor.setTool("box");

    expect(canvas.committed.get(new Vector(5, 5))).toBe("T");
    expect(canvas.committed.get(new Vector(6, 5))).toBe("E");
    expect(canvas.committed.get(new Vector(7, 5))).toBe("S");
    expect(canvas.committed.get(new Vector(8, 5))).toBe("T");
  });
});

describe("Theme collapsing list", () => {
  test("PRIMARY_THEMES has at most 10 themes and all are valid THEME_CHOICES", () => {
    expect(PRIMARY_THEMES.length).toBeLessThanOrEqual(10);
    expect(PRIMARY_THEMES.length).toBeGreaterThanOrEqual(6);
    for (const t of PRIMARY_THEMES) {
      expect(THEME_CHOICES).toContain(t);
    }
  });
});
