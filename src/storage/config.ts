// User config: ${XDG_CONFIG_HOME:-~/.config}/lazydraw/config.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { TOOL_IDS, type ToolId } from "../core/editor";
import {
  DEFAULT_EXPORT,
  type ExportConfig,
  type FontFamily,
  FONT_FAMILIES,
  isExportFormat,
  isFontFamily,
  isWrapper,
} from "../core/export";
import type { ArrowStyle, BoxShape, LineStyle, TextMode } from "../core/style";
import { type TextFontStyle, TEXT_FONT_STYLES } from "../core/text";
import { SCHEME_NAMES, type ThemeName } from "../tui/theme";

export type { ArrowStyle, BoxShape, LineStyle, TextMode } from "../core/style";
export { type TextFontStyle, TEXT_FONT_STYLES } from "../core/text";

export type GridStyle = "lattice" | "checker" | "dots" | "off";
export type FileSort = "recent" | "name";

export const GRID_STYLES: readonly GridStyle[] = ["lattice", "checker", "dots", "off"];
export const TEXT_MODES: readonly TextMode[] = ["inplace", "layer"];
export const LINE_STYLES: readonly LineStyle[] = ["single", "double", "dashed"];
export const ARROW_STYLES: readonly ArrowStyle[] = ["solid", "open", "ascii"];
export const BOX_SHAPES: readonly BoxShape[] = ["rect", "round", "double", "diamond", "ellipse", "cylinder"];
export const FILE_SORTS: readonly FileSort[] = ["recent", "name"];

/** `terminal` wears the terminal's own palette; the rest are the themes in `tui/theme.ts`. */
export type ThemeChoice = ThemeName;

export const THEME_CHOICES: readonly ThemeChoice[] = ["terminal", ...SCHEME_NAMES];

/** The top ~10 curated themes displayed by default in settings. */
export const PRIMARY_THEMES: readonly ThemeChoice[] = [
  "terminal",
  "dracula",
  "nord",
  "tokyo-night",
  "catppuccin-mocha",
  "gruvbox",
  "monokai",
  "solarized-dark",
  "cyberpunk",
  "paper",
];

export interface Config {
  theme: ThemeChoice;
  grid: GridStyle;
  /** Whether finishing a selection puts it on the clipboard by itself (§settings). */
  copyOnSelect: boolean;
  lastDrawing: string | null;
  export: ExportConfig;
  /** `inplace` edits existing labels; `layer` always writes to a fresh overlay (old behaviour). */
  textMode: TextMode;
  /** Typing in text mode inserts and shifts the rest of the line instead of overwriting. */
  insertMode: boolean;
  /** Eraser/pencil brush size in cells. */
  brushSize: number;
  fontStyle: TextFontStyle;
  boxShape: BoxShape;
  lineStyle: LineStyle;
  arrowStyle: ArrowStyle;
  /** Autosave debounce in ms. 0 disables it. */
  autosaveMs: number;
  defaultTool: ToolId;
  confirmQuit: boolean;
  scrollSpeed: number;
  cursorBlink: boolean;
  smartConnectors: boolean;
  /** Default width in cells for imported photos and videos. */
  mediaWidth: number;
  fileSort: FileSort;
  /** Show the current drawing path in the status bar. */
  showPath: boolean;
  /** Show the floating context mini-bar over selections. */
  showMiniBar: boolean;
  /** Command-id -> key binding overrides, e.g. {"app:undo": "primary+z"}. */
  keymap: Record<string, string>;
  /** Autosnapshot interval in ms. 0 disables automatic snapshots. */
  snapshotMs: number;
  /** How many snapshots to keep per drawing. */
  historyLimit: number;
}

export const DEFAULT_CONFIG: Config = {
  theme: "terminal",
  grid: "lattice",
  copyOnSelect: false,
  lastDrawing: null,
  export: DEFAULT_EXPORT,
  textMode: "inplace",
  insertMode: true,
  brushSize: 1,
  fontStyle: "normal",
  boxShape: "rect",
  lineStyle: "single",
  arrowStyle: "solid",
  autosaveMs: 500,
  defaultTool: "box",
  confirmQuit: true,
  scrollSpeed: 1,
  cursorBlink: true,
  smartConnectors: true,
  mediaWidth: 80,
  fileSort: "recent",
  showPath: true,
  showMiniBar: true,
  keymap: {},
  snapshotMs: 120_000,
  historyLimit: 50,
};

export function configPath(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "lazydraw", "config.json");
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const intIn = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function loadConfig(path = configPath()): Config {
  let raw: Partial<Config> = {};
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
  const exp: Partial<ExportConfig> = raw.export ?? {};
  return {
    theme: oneOf(raw.theme, THEME_CHOICES, DEFAULT_CONFIG.theme),
    grid: oneOf(raw.grid, GRID_STYLES, DEFAULT_CONFIG.grid),
    copyOnSelect: raw.copyOnSelect === true,
    lastDrawing: typeof raw.lastDrawing === "string" ? raw.lastDrawing : null,
    export: {
      characters: exp.characters === "basic" ? "basic" : "extended",
      wrapper: exp.wrapper && isWrapper(exp.wrapper) ? exp.wrapper : "none",
      fenced: exp.fenced === true,
      format: exp.format && isExportFormat(exp.format) ? exp.format : DEFAULT_EXPORT.format,
      fontFamily: exp.fontFamily && isFontFamily(exp.fontFamily) ? exp.fontFamily : DEFAULT_EXPORT.fontFamily,
      fontSize: intIn(exp.fontSize, 8, 48, DEFAULT_EXPORT.fontSize),
      selectionOnly: exp.selectionOnly === true,
    },
    textMode: oneOf(raw.textMode, TEXT_MODES, DEFAULT_CONFIG.textMode),
    insertMode: raw.insertMode !== false,
    brushSize: intIn(raw.brushSize, 1, 9, DEFAULT_CONFIG.brushSize),
    fontStyle: oneOf(raw.fontStyle, TEXT_FONT_STYLES, DEFAULT_CONFIG.fontStyle),
    boxShape: oneOf(raw.boxShape, BOX_SHAPES, DEFAULT_CONFIG.boxShape),
    lineStyle: oneOf(raw.lineStyle, LINE_STYLES, DEFAULT_CONFIG.lineStyle),
    arrowStyle: oneOf(raw.arrowStyle, ARROW_STYLES, DEFAULT_CONFIG.arrowStyle),
    autosaveMs: intIn(raw.autosaveMs, 0, 30_000, DEFAULT_CONFIG.autosaveMs),
    defaultTool: oneOf(raw.defaultTool, TOOL_IDS, DEFAULT_CONFIG.defaultTool),
    confirmQuit: raw.confirmQuit !== false,
    scrollSpeed: intIn(raw.scrollSpeed, 1, 5, DEFAULT_CONFIG.scrollSpeed),
    cursorBlink: raw.cursorBlink !== false,
    smartConnectors: raw.smartConnectors !== false,
    mediaWidth: intIn(raw.mediaWidth, 20, 200, DEFAULT_CONFIG.mediaWidth),
    fileSort: oneOf(raw.fileSort, FILE_SORTS, DEFAULT_CONFIG.fileSort),
    showPath: raw.showPath !== false,
    showMiniBar: raw.showMiniBar !== false,
    keymap:
      raw.keymap && typeof raw.keymap === "object" && !Array.isArray(raw.keymap)
        ? Object.fromEntries(
            Object.entries(raw.keymap).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          )
        : {},
    snapshotMs: intIn(raw.snapshotMs, 0, 3_600_000, DEFAULT_CONFIG.snapshotMs),
    historyLimit: intIn(raw.historyLimit, 1, 500, DEFAULT_CONFIG.historyLimit),
  };
}

export function saveConfig(config: Config, path = configPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  } catch {
    // Config is a convenience; never crash the editor over it.
  }
}

export function fontFamilies(): readonly FontFamily[] {
  return FONT_FAMILIES;
}
