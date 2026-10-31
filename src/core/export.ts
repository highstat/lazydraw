// Export formatting. Wrapper semantics ported from ASCIIFlow (client/export.tsx), MIT © Lewis Hemens.
import { BASIC } from "./glyphs";
import type { LayerView } from "./layer";
import { layerToText } from "./text";

export const WRAPPERS = [
  { id: "none", label: "none" },
  { id: "star", label: "/* */" },
  { id: "star-filled", label: "/***/" },
  { id: "triple-quotes", label: '""" """' },
  { id: "hash", label: "# hash" },
  { id: "slash", label: "// slash" },
  { id: "three-slashes", label: "/// triple" },
  { id: "dash", label: "-- dash" },
  { id: "apostrophe", label: "' apostrophe" },
  { id: "backticks", label: "``` backticks" },
  { id: "four-spaces", label: "    indent" },
  { id: "semicolon", label: "; semicolon" },
] as const;

export type Wrapper = (typeof WRAPPERS)[number]["id"];
export type Charset = "extended" | "basic";
export type ExportFormat = "txt" | "svg" | "html";

/** Monospace families offered for SVG/HTML exports. The TUI itself uses the terminal font. */
export const FONT_FAMILIES = [
  "JetBrains Mono",
  "Fira Code",
  "IBM Plex Mono",
  "Iosevka",
  "Cascadia Code",
  "SF Mono",
  "Menlo",
  "Consolas",
  "monospace",
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export interface ExportConfig {
  characters: Charset;
  wrapper: Wrapper;
  /** Wrap the result in a Markdown code fence. */
  fenced: boolean;
  format: ExportFormat;
  fontFamily: FontFamily;
  fontSize: number;
  /** Export only the current selection when there is one. */
  selectionOnly: boolean;
}

export const DEFAULT_EXPORT: ExportConfig = {
  characters: "extended",
  wrapper: "none",
  fenced: false,
  format: "txt",
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  selectionOnly: false,
};

export function isWrapper(value: string): value is Wrapper {
  return WRAPPERS.some((w) => w.id === value);
}

export function isExportFormat(value: string): value is ExportFormat {
  return value === "txt" || value === "svg" || value === "html";
}

export function isFontFamily(value: string): value is FontFamily {
  return (FONT_FAMILIES as readonly string[]).includes(value);
}

export function toBasic(text: string): string {
  return [...text].map((ch) => BASIC.get(ch) ?? ch).join("");
}

export function applyExportConfig(text: string, config: ExportConfig): string {
  if (config.characters === "basic") text = toBasic(text);
  let lines = text.split("\n");
  const prefix = (p: string) => (lines = lines.map((l) => `${p}${l}`));
  switch (config.wrapper) {
    case "star":
      lines = ["/*", ...lines, " */"];
      break;
    case "star-filled":
      lines = ["/*", ...lines.map((l) => ` * ${l}`), " */"];
      break;
    case "triple-quotes":
      lines = [config.characters === "basic" ? '"""' : 'u"""', ...lines, '"""'];
      break;
    case "hash":
      prefix("# ");
      break;
    case "slash":
      prefix("// ");
      break;
    case "three-slashes":
      prefix("/// ");
      break;
    case "dash":
      prefix("-- ");
      break;
    case "apostrophe":
      prefix("' ");
      break;
    case "backticks":
      lines = ["```", ...lines, "```"];
      break;
    case "four-spaces":
      prefix("    ");
      break;
    case "semicolon":
      prefix("; ");
      break;
  }
  if (config.fenced) lines = ["```text", ...lines, "```"];
  return lines.join("\n");
}

/** Drawing text: bounding box of all non-empty cells, trailing spaces trimmed per row. */
export function exportText(layer: LayerView, config: ExportConfig): string {
  return applyExportConfig(layerToText(layer, null, true), config);
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Standalone SVG. Cells are laid out on a monospace grid, so diagrams stay crisp at
 * any zoom and can be dropped straight into a README or a slide.
 */
export function exportSvg(text: string, config: ExportConfig): string {
  const lines = text.split("\n");
  const columns = Math.max(1, ...lines.map((line) => [...line].length));
  const pad = 2;
  const cellW = Math.max(6, Math.round(config.fontSize * 0.6));
  const cellH = Math.max(12, Math.round(config.fontSize * 1.25));
  const width = (columns + pad * 2) * cellW;
  const height = (Math.max(1, lines.length) + pad * 2 - 1) * cellH;
  const body = lines
    .map(
      (line, i) =>
        `<text x="${pad * cellW}" y="${(pad + i) * cellH}" xml:space="preserve">${escapeXml(line)}</text>`,
    )
    .join("\n    ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="100%" height="100%" fill="#ffffff"/>`,
    `  <g font-family="${escapeXml(config.fontFamily)}, monospace" font-size="${config.fontSize}" fill="#24292f">`,
    `    ${body}`,
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

/** A self-contained HTML page with the drawing in a <pre> block. */
export function exportHtml(text: string, config: ExportConfig): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    "  <title>lazydraw diagram</title>",
    "  <style>",
    "    body { margin: 0; padding: 24px; background: #fff; }",
    `    pre { margin: 0; color: #24292f; font-family: "${config.fontFamily}", ui-monospace, monospace; font-size: ${config.fontSize}px; line-height: 1.25; }`,
    "  </style>",
    "</head>",
    "<body>",
    `<pre>${escapeXml(text)}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export interface RenderedExport {
  text: string;
  extension: string;
}

/** Renders the drawing in the configured format. Wrappers only apply to plain text. */
export function renderExport(layer: LayerView, config: ExportConfig): RenderedExport {
  if (config.format === "svg") return { text: exportSvg(layerToText(layer, null, true), config), extension: "svg" };
  if (config.format === "html") return { text: exportHtml(layerToText(layer, null, true), config), extension: "html" };
  return { text: exportText(layer, config), extension: "txt" };
}
