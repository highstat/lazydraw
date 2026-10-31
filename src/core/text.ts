// Layer <-> plain text. Ported from ASCIIFlow (client/text_utils.ts), MIT © Lewis Hemens.
import { Box, boundingBox } from "./box";
import type { LayerView } from "./layer";
import { Layer } from "./layer";
import { Vector } from "./vector";

const isControl = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c < 32 || c === 127;
};

/** Terminal display width of a single code point: 0, 1 or 2. */
export function charWidth(ch: string): number {
  return Bun.stringWidth(ch);
}

/** Text tool / import only accept single-width printable characters. */
export function isPlaceable(ch: string): boolean {
  return [...ch].length === 1 && !isControl(ch) && charWidth(ch) === 1;
}

/** A printable cell glyph (not empty, not whitespace, not a control character). */
export function isText(ch: string | null | undefined): boolean {
  return ch != null && ch !== "" && ch !== " " && !isControl(ch);
}

export type TextFontStyle = "normal" | "bold" | "double" | "smallcaps" | "italic";
export const TEXT_FONT_STYLES: readonly TextFontStyle[] = ["normal", "bold", "double", "smallcaps", "italic"];

const DOUBLE_STRUCK_SPECIAL: Record<string, string> = {
  C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ",
};

const SMALL_CAPS_MAP: Record<string, string> = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ",
  j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ꞯ", r: "ʀ",
  s: "ꜱ", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};

/** Transforms a single printable character into a stylized Unicode font variant. */
export function transformChar(ch: string, style: TextFontStyle = "normal"): string {
  if (style === "normal" || [...ch].length !== 1) return ch;
  const code = ch.charCodeAt(0);
  if (style === "bold") {
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d400 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d41a + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ce + code - 48);
  } else if (style === "double") {
    if (code >= 65 && code <= 90) return DOUBLE_STRUCK_SPECIAL[ch] ?? String.fromCodePoint(0x1d538 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d552 + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7d8 + code - 48);
  } else if (style === "smallcaps") {
    return SMALL_CAPS_MAP[ch.toLowerCase()] ?? ch;
  } else if (style === "italic") {
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d434 + code - 65);
    if (ch === "h") return "ℎ";
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d44e + code - 97);
  }
  return ch;
}

/**
 * Renders the layer as text. Without a box, uses the bounding box of all
 * non-empty cells. Trailing spaces are kept when a box is given (ASCIIFlow
 * behaviour); `trimRight` strips them per row.
 */
export function layerToText(layer: LayerView, box?: Box | null, trimRight = false): string {
  const cells = layer.keys().filter((k) => !!layer.get(k));
  if (!box) {
    box = boundingBox(cells);
    if (!box) return "";
  }
  const rows: string[][] = Array.from({ length: box.height() }, () => Array(box!.width()).fill(" "));
  for (const p of cells) {
    if (!box.contains(p)) continue;
    let v = layer.get(p)!;
    if (isControl(v)) v = " ";
    rows[p.y - box.top()]![p.x - box.left()] = v;
  }
  const lines = rows.map((r) => r.join(""));
  return (trimRight ? lines.map((l) => l.replace(/ +$/, "")) : lines).join("\n");
}

/**
 * Loads text at `offset`. Spaces and control characters are skipped; wide
 * characters are replaced with "?" so the grid stays aligned.
 */
export function textToLayer(value: string, offset: Vector = new Vector(0, 0)): Layer {
  const layer = new Layer();
  const lines = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  for (let y = 0; y < lines.length; y++) {
    let x = 0;
    for (const ch of lines[y]!) {
      if (ch !== " " && !isControl(ch)) {
        layer.set(new Vector(x, y).add(offset), charWidth(ch) === 1 ? ch : "?");
      }
      x++;
    }
  }
  return layer;
}

/** Size of a block of text in cells. */
export function textSize(value: string): Vector {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  return new Vector(Math.max(0, ...lines.map((l) => [...l].length)), lines.length);
}
