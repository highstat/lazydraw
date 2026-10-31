// ASCII and Unicode table generator for diagrams.
import type { LineStyle } from "./style";

export interface TableOptions {
  cols: number;
  rows: number;
  colWidth?: number;
  lineStyle?: LineStyle;
  headers?: string[];
}

const TABLE_GLYPHS = {
  single: {
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    h: "─",
    v: "│",
    tTop: "┬",
    tBottom: "┴",
    tLeft: "├",
    tRight: "┤",
    cross: "┼",
  },
  double: {
    tl: "╔",
    tr: "╗",
    bl: "╚",
    br: "╝",
    h: "═",
    v: "║",
    tTop: "╦",
    tBottom: "╩",
    tLeft: "╠",
    tRight: "╣",
    cross: "╬",
  },
  dashed: {
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    h: "╌",
    v: "╎",
    tTop: "┬",
    tBottom: "┴",
    tLeft: "├",
    tRight: "┤",
    cross: "┼",
  },
} as const;

/**
 * Generates an ASCII/Unicode table formatted with headers and cells.
 */
export function generateTable(opts: TableOptions): string {
  const cols = Math.max(1, Math.min(20, Math.round(opts.cols)));
  const rows = Math.max(1, Math.min(50, Math.round(opts.rows)));
  const colWidth = Math.max(4, Math.min(40, opts.colWidth ?? 10));
  const style = opts.lineStyle ?? "single";
  const g = TABLE_GLYPHS[style] ?? TABLE_GLYPHS.single;

  const lines: string[] = [];

  // Top border: ┌──────┬──────┐
  const topParts = Array.from({ length: cols }, () => g.h.repeat(colWidth));
  lines.push(`${g.tl}${topParts.join(g.tTop)}${g.tr}`);

  // Header row
  const headerCells = Array.from({ length: cols }, (_, i) => {
    const raw = opts.headers?.[i] ?? `Col ${i + 1}`;
    const truncated = [...raw].slice(0, colWidth - 2).join("");
    const padTotal = colWidth - [...truncated].length;
    const padL = Math.floor(padTotal / 2);
    const padR = padTotal - padL;
    return " ".repeat(padL) + truncated + " ".repeat(padR);
  });
  lines.push(`${g.v}${headerCells.join(g.v)}${g.v}`);

  // Separator below header: ├──────┼──────┤
  const midParts = Array.from({ length: cols }, () => g.h.repeat(colWidth));
  lines.push(`${g.tLeft}${midParts.join(g.cross)}${g.tRight}`);

  // Data rows
  const emptyCell = " ".repeat(colWidth);
  const emptyRow = `${g.v}${Array.from({ length: cols }, () => emptyCell).join(g.v)}${g.v}`;

  for (let r = 0; r < rows; r++) {
    lines.push(emptyRow);
    if (r < rows - 1) {
      lines.push(`${g.tLeft}${midParts.join(g.cross)}${g.tRight}`);
    }
  }

  // Bottom border: └──────┴──────┘
  lines.push(`${g.bl}${midParts.join(g.tBottom)}${g.br}`);

  return lines.join("\n");
}
