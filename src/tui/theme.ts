// Color tokens. The default `terminal` theme wears the terminal's own palette; the rest are
// ports of popular IDE themes. Every theme states a handful of colors and derives the rest.
import { type CliRenderer, RGBA } from "@opentui/core";

export interface ThemeTokens {
  /** In the `terminal` theme this is the terminal's own background; the hex is the blending fallback. */
  bg: string;
  /** Checker grid style only. */
  bgAlt: string;
  grid: string;
  /** Committed glyphs. */
  fg: string;
  /** In-progress glyphs (ASCIIFlow draws them in the text color). */
  scratch: string;
  /** Background behind in-progress glyphs. */
  highlight: string;
  selectionBg: string;
  /** Like `bg`. */
  tbBg: string;
  tbBorder: string;
  tbLabel: string;
  tbHover: string;
  tbHoverBg: string;
  text: string;
  muted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  purple: string;
  orange: string;
  cyan: string;
  undo: string;
  redo: string;
  disabled: string;
}

/** What a theme actually states. Greys, the grid and the selection are derived from `bg` and `fg`. */
export interface ColorScheme {
  bg: string;
  fg: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  orange: string;
}

/** Ten IDE themes, each sampled from its published palette. */
export const SCHEMES = {
  dracula: {
    bg: "#282a36",
    fg: "#f8f8f2",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#6272a4",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    orange: "#ffb86c",
  },
  nord: {
    bg: "#2e3440",
    fg: "#d8dee9",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    orange: "#d08770",
  },
  "tokyo-night": {
    bg: "#1a1b26",
    fg: "#c0caf5",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    orange: "#ff9e64",
  },
  catppuccin: {
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#94e2d5",
    orange: "#fab387",
  },
  "one-dark": {
    bg: "#282c34",
    fg: "#abb2bf",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    orange: "#d19a66",
  },
  gruvbox: {
    bg: "#282828",
    fg: "#ebdbb2",
    red: "#fb4934",
    green: "#b8bb26",
    yellow: "#fabd2f",
    blue: "#83a598",
    magenta: "#d3869b",
    cyan: "#8ec07c",
    orange: "#fe8019",
  },
  monokai: {
    bg: "#272822",
    fg: "#f8f8f2",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#e6db74",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#66d9ef",
    orange: "#fd971f",
  },
  "night-owl": {
    bg: "#011627",
    fg: "#d6deeb",
    red: "#ef5350",
    green: "#22da6e",
    yellow: "#c5e478",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#21c7a8",
    orange: "#f78c6c",
  },
  "solarized-dark": {
    bg: "#002b36",
    fg: "#93a1a1",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    orange: "#cb4b16",
  },
  "github-light": {
    bg: "#ffffff",
    fg: "#24292f",
    red: "#cf222e",
    green: "#1a7f37",
    yellow: "#9a6700",
    blue: "#0969da",
    magenta: "#8250df",
    cyan: "#1b7c83",
    orange: "#bc4c00",
  },
  "catppuccin-latte": {
    bg: "#eff1f5",
    fg: "#4c4f69",
    red: "#d20f39",
    green: "#40a02b",
    yellow: "#df8e1d",
    blue: "#1e66f5",
    magenta: "#8839ef",
    cyan: "#179299",
    orange: "#fe640b",
  },
  "catppuccin-frappe": {
    bg: "#303446",
    fg: "#c6d0f5",
    red: "#e78284",
    green: "#a6d189",
    yellow: "#e5c890",
    blue: "#8caaee",
    magenta: "#ca9ee6",
    cyan: "#81c8be",
    orange: "#ef9f76",
  },
  "catppuccin-macchiato": {
    bg: "#24273a",
    fg: "#cad3f5",
    red: "#ed8796",
    green: "#a6da95",
    yellow: "#eed49f",
    blue: "#8aadf4",
    magenta: "#c6a0f6",
    cyan: "#8bd5ca",
    orange: "#f5a97f",
  },
  "gruvbox-light": {
    bg: "#fbf1c7",
    fg: "#3c3836",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    orange: "#d65d0e",
  },
  "tokyo-night-storm": {
    bg: "#24283b",
    fg: "#c0caf5",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    orange: "#ff9e64",
  },
  "tokyo-night-light": {
    bg: "#e1e2e7",
    fg: "#3760bf",
    red: "#f52a65",
    green: "#587539",
    yellow: "#8c6c3e",
    blue: "#2e7de9",
    magenta: "#9854f1",
    cyan: "#007197",
    orange: "#b15c00",
  },
  "rose-pine": {
    bg: "#191724",
    fg: "#e0def4",
    red: "#eb6f92",
    green: "#31748f",
    yellow: "#f6c177",
    blue: "#9ccfd8",
    magenta: "#c4a7e7",
    cyan: "#ebbcba",
    orange: "#f6c177",
  },
  "rose-pine-moon": {
    bg: "#232136",
    fg: "#e0def4",
    red: "#eb6f92",
    green: "#3e8fb0",
    yellow: "#f6c177",
    blue: "#9ccfd8",
    magenta: "#c4a7e7",
    cyan: "#ea9a97",
    orange: "#f6c177",
  },
  "rose-pine-dawn": {
    bg: "#faf4ed",
    fg: "#575279",
    red: "#b4637a",
    green: "#56949f",
    yellow: "#ea9d34",
    blue: "#286983",
    magenta: "#907aa9",
    cyan: "#d7827e",
    orange: "#ea9d34",
  },
  kanagawa: {
    bg: "#1f1f28",
    fg: "#dcd7ba",
    red: "#e46876",
    green: "#98bb6c",
    yellow: "#e6c384",
    blue: "#7e9cd8",
    magenta: "#957fb8",
    cyan: "#7aa89f",
    orange: "#ffa066",
  },
  everforest: {
    bg: "#2d353b",
    fg: "#d3c6aa",
    red: "#e67e80",
    green: "#a7c080",
    yellow: "#dbbc7f",
    blue: "#7fbbb3",
    magenta: "#d699b6",
    cyan: "#83c092",
    orange: "#e69875",
  },
  "everforest-light": {
    bg: "#fdf6e3",
    fg: "#5c6a72",
    red: "#f85552",
    green: "#8da101",
    yellow: "#dfa000",
    blue: "#3a94c5",
    magenta: "#df69ba",
    cyan: "#35a77c",
    orange: "#f57d26",
  },
  "ayu-dark": {
    bg: "#0b0e14",
    fg: "#bfbdb6",
    red: "#f07178",
    green: "#aad94c",
    yellow: "#ffb454",
    blue: "#59c2ff",
    magenta: "#d2a6ff",
    cyan: "#95e6cb",
    orange: "#ff8f40",
  },
  "ayu-mirage": {
    bg: "#1f2430",
    fg: "#cbccc6",
    red: "#f28779",
    green: "#bae67e",
    yellow: "#ffd580",
    blue: "#73d0ff",
    magenta: "#d4bfff",
    cyan: "#95e6cb",
    orange: "#ffa759",
  },
  "ayu-light": {
    bg: "#fafafa",
    fg: "#5c6773",
    red: "#f07171",
    green: "#86b300",
    yellow: "#f2ae49",
    blue: "#399ee6",
    magenta: "#a37acc",
    cyan: "#4cbf99",
    orange: "#fa8d3e",
  },
  material: {
    bg: "#263238",
    fg: "#eeffff",
    red: "#f07178",
    green: "#c3e88d",
    yellow: "#ffcb6b",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#89ddff",
    orange: "#f78c6c",
  },
  "material-light": {
    bg: "#fafafa",
    fg: "#90a4ae",
    red: "#ff5370",
    green: "#91b859",
    yellow: "#ffb62c",
    blue: "#6182b8",
    magenta: "#7c4dff",
    cyan: "#39adb5",
    orange: "#f76d47",
  },
  "github-dark": {
    bg: "#0d1117",
    fg: "#c9d1d9",
    red: "#ff7b72",
    green: "#7ee787",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    orange: "#ffa657",
  },
  "github-dark-dimmed": {
    bg: "#22272e",
    fg: "#adbac7",
    red: "#f47067",
    green: "#8ddb8c",
    yellow: "#c69026",
    blue: "#539bf5",
    magenta: "#b083f0",
    cyan: "#39c5cf",
    orange: "#e0823d",
  },
  "solarized-light": {
    bg: "#fdf6e3",
    fg: "#657b83",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    orange: "#cb4b16",
  },
  "synthwave-84": {
    bg: "#262335",
    fg: "#ffffff",
    red: "#fe4450",
    green: "#72f1b8",
    yellow: "#fede5d",
    blue: "#03edf9",
    magenta: "#ff7edb",
    cyan: "#03edf9",
    orange: "#ff8b39",
  },
  cobalt2: {
    bg: "#193549",
    fg: "#ffffff",
    red: "#ff628c",
    green: "#3ad900",
    yellow: "#ffc600",
    blue: "#0088ff",
    magenta: "#fb94ff",
    cyan: "#80ffbb",
    orange: "#ff9d00",
  },
  flexoki: {
    bg: "#100f0f",
    fg: "#cecdc3",
    red: "#d14d41",
    green: "#879a39",
    yellow: "#d0a215",
    blue: "#4385be",
    magenta: "#ce5d97",
    cyan: "#3aa99f",
    orange: "#da702c",
  },
  zenburn: {
    bg: "#3f3f3f",
    fg: "#dcdccc",
    red: "#cc9393",
    green: "#7f9f7f",
    yellow: "#f0dfaf",
    blue: "#8cd0d3",
    magenta: "#dc8cc3",
    cyan: "#93e0e3",
    orange: "#dfaf8f",
  },
  iceberg: {
    bg: "#161821",
    fg: "#c6c8d1",
    red: "#e27878",
    green: "#b4be82",
    yellow: "#e2a478",
    blue: "#84a0c6",
    magenta: "#a093c7",
    cyan: "#89b8c2",
    orange: "#e2a478",
  },
  oxocarbon: {
    bg: "#161616",
    fg: "#f2f4f8",
    red: "#ee5396",
    green: "#42be65",
    yellow: "#ffe97b",
    blue: "#33b1ff",
    magenta: "#be95ff",
    cyan: "#3ddbd9",
    orange: "#ff832b",
  },
  poimandres: {
    bg: "#1b1e28",
    fg: "#a6accd",
    red: "#d0679d",
    green: "#5de4c7",
    yellow: "#fffac2",
    blue: "#89ddff",
    magenta: "#fcc5e4",
    cyan: "#add7ff",
    orange: "#f087bd",
  },
  nightfox: {
    bg: "#192330",
    fg: "#cdcecf",
    red: "#c94f6d",
    green: "#81b29a",
    yellow: "#dbc074",
    blue: "#719cd6",
    magenta: "#9d79d6",
    cyan: "#63cdcf",
    orange: "#f4a261",
  },
  matrix: {
    bg: "#0d0208",
    fg: "#00ff41",
    red: "#ff3b30",
    green: "#00ff41",
    yellow: "#a3ff00",
    blue: "#008f11",
    magenta: "#00ff66",
    cyan: "#03a062",
    orange: "#50ff50",
  },
  cyberpunk: {
    bg: "#080812",
    fg: "#e0e6ed",
    red: "#ff003c",
    green: "#00ff9f",
    yellow: "#fcee0a",
    blue: "#00f0ff",
    magenta: "#ea00d9",
    cyan: "#711c91",
    orange: "#ff5900",
  },
  "catppuccin-mocha": {
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#89dceb",
    orange: "#fab387",
  },
  "dracula-alucard": {
    bg: "#f8f8f2",
    fg: "#282a36",
    red: "#cb3b3b",
    green: "#1b9b47",
    yellow: "#b58900",
    blue: "#4a5b94",
    magenta: "#8452cd",
    cyan: "#1a8f94",
    orange: "#c96a1a",
  },
  "nord-light": {
    bg: "#eceff4",
    fg: "#2e3440",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#d08770",
    blue: "#5e81ac",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    orange: "#ebcb8b",
  },
  vesper: {
    bg: "#101010",
    fg: "#ffffff",
    red: "#ff5370",
    green: "#a3be8c",
    yellow: "#ffc799",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#89ddff",
    orange: "#ff5d00",
  },
  "monokai-pro": {
    bg: "#2d2a2e",
    fg: "#fcfcfa",
    red: "#ff6188",
    green: "#a9dc76",
    yellow: "#ffd866",
    blue: "#78dce8",
    magenta: "#ab9df2",
    cyan: "#78dce8",
    orange: "#fc9867",
  },
  laserwave: {
    bg: "#1b1924",
    fg: "#e0dfee",
    red: "#eb64b9",
    green: "#74dfc4",
    yellow: "#ffe261",
    blue: "#40b4c4",
    magenta: "#b381c5",
    cyan: "#66d9ef",
    orange: "#f78c6c",
  },
  paper: {
    bg: "#fbfbfa",
    fg: "#111111",
    red: "#c92a2a",
    green: "#2b8a3e",
    yellow: "#e67700",
    blue: "#1864ab",
    magenta: "#862e9c",
    cyan: "#0c8599",
    orange: "#d9480f",
  },
  coffee: {
    bg: "#2b211b",
    fg: "#f5e6d3",
    red: "#d95d39",
    green: "#8a9a5b",
    yellow: "#e9c46a",
    blue: "#9d8189",
    magenta: "#b5838d",
    cyan: "#a8dadc",
    orange: "#d4a373",
  },
  "hacker-amber": {
    bg: "#120a00",
    fg: "#ffb000",
    red: "#ff4500",
    green: "#ffcc00",
    yellow: "#ffd700",
    blue: "#ff9900",
    magenta: "#ff7700",
    cyan: "#ffa500",
    orange: "#ff8800",
  },
} satisfies Record<string, ColorScheme>;

export type SchemeName = keyof typeof SCHEMES;
export type ThemeName = "terminal" | SchemeName;

export const SCHEME_NAMES = Object.keys(SCHEMES) as SchemeName[];

/** Stands in for the `terminal` theme until the terminal answers, or if it never does. */
export const FALLBACK_SCHEME: SchemeName = "nord";

/** How long startup waits for the terminal's answer before painting in the stand-in scheme. */
export const PALETTE_WAIT_MS = 300;

export type Palette = { readonly [K in keyof ThemeTokens]: RGBA } & { readonly name: ThemeName };

/** The terminal's own colors, read with OSC 10/11/4. `ansi` is the 16-color palette. */
export interface TerminalColors {
  fg: string;
  bg: string;
  /** Entries the terminal did not report are null. */
  ansi: (string | null)[];
}

/**
 * How far the lattice sits from the background, toward the text color. ASCIIFlow's own gridlines
 * are barely there, and a derived grid also survives whatever background the theme has.
 */
const GRID_MIX = 0.07;
/** The checker style's alternate cell, likewise derived. */
const CHECKER_MIX = 0.04;

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** Blends two hex colors; `t` is how far to move from `a` toward `b`. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return `#${hex(ar + (br - ar) * t)}${hex(ag + (bg - ag) * t)}${hex(ab + (bb - ab) * t)}`;
}

function rgb(h: string): [number, number, number] {
  const v = h.replace("#", "");
  const n = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
  return [Number.parseInt(n.slice(0, 2), 16), Number.parseInt(n.slice(2, 4), 16), Number.parseInt(n.slice(4, 6), 16)];
}

/** Greys are blends toward the text color, so one rule fits dark and light schemes alike. */
function tokens(c: ColorScheme): ThemeTokens {
  const dim = (t: number) => mix(c.bg, c.fg, t);
  return {
    bg: c.bg,
    bgAlt: dim(CHECKER_MIX),
    grid: dim(GRID_MIX),
    fg: c.fg,
    scratch: c.fg,
    highlight: dim(0.14),
    selectionBg: dim(0.26),
    tbBg: c.bg,
    tbBorder: dim(0.32),
    tbLabel: dim(0.55),
    tbHover: c.fg,
    tbHoverBg: dim(0.2),
    text: c.fg,
    muted: dim(0.55),
    accent: c.cyan,
    success: c.green,
    warning: c.yellow,
    danger: c.red,
    purple: c.magenta,
    orange: c.orange,
    cyan: c.cyan,
    undo: c.green,
    redo: c.red,
    disabled: dim(0.35),
  };
}

/** The terminal's palette as a scheme. Colors it did not report fall back to the stand-in theme. */
function terminalScheme(c: TerminalColors): ColorScheme {
  const f = SCHEMES[FALLBACK_SCHEME];
  const at = (i: number, fallback: string) => c.ansi[i] ?? fallback;
  return {
    bg: c.bg,
    fg: c.fg,
    red: at(1, f.red),
    green: at(2, f.green),
    yellow: at(3, f.yellow),
    blue: at(4, f.blue),
    magenta: at(5, f.magenta),
    cyan: at(6, f.cyan),
    orange: at(9, f.orange),
  };
}

const cache = new Map<string, Palette>();

/** Tokens drawn with the terminal's default background (SGR 49), so the `terminal` theme is see-through. */
const BG_TOKENS = new Set(["bg", "tbBg"]);

/**
 * `term` is the terminal's detected palette, needed only by the `terminal` theme. Without it that
 * theme falls back to a scheme, since there is nothing to inherit.
 */
export function palette(name: ThemeName, term: TerminalColors | null = null): Palette {
  const inherit = name === "terminal" && term !== null;
  const key = inherit ? `terminal|${term.bg}${term.fg}${term.ansi.join("")}` : name;
  let p = cache.get(key);
  if (!p) {
    const scheme = inherit ? terminalScheme(term) : SCHEMES[name === "terminal" ? FALLBACK_SCHEME : name];
    p = Object.freeze({
      name,
      ...Object.fromEntries(
        Object.entries(tokens(scheme)).map(([k, v]) => [
          k,
          // Only the inherited theme leaves the background to the terminal; a scheme paints its own.
          inherit && BG_TOKENS.has(k) ? RGBA.defaultBackground(v) : RGBA.fromHex(v),
        ]),
      ),
    }) as Palette;
    cache.set(key, p);
  }
  return p;
}

/**
 * Reads the terminal's palette (OSC 10/11/4) so the `terminal` theme can inherit it. Best effort:
 * terminals that do not answer get null and keep the stand-in scheme. The renderer caches the
 * answer and folds concurrent calls into one query, so asking twice is free.
 */
export async function detectTerminalColors(renderer: CliRenderer): Promise<TerminalColors | null> {
  try {
    const c = await renderer.getPalette({ size: 16 });
    if (!c.defaultForeground || !c.defaultBackground) return null;
    return { fg: c.defaultForeground, bg: c.defaultBackground, ansi: c.palette.slice(0, 16) };
  } catch {
    return null;
  }
}

/** Resolves to the terminal's colors, or null if it has not answered within `ms`. */
export async function detectTerminalColorsSoon(renderer: CliRenderer, ms: number): Promise<TerminalColors | null> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([detectTerminalColors(renderer), deadline]).finally(() => clearTimeout(timer));
}
