// `files` popover: searchable, scrollable drawing list, actions and real paths.
import type { Host } from "../host";
import { ATTR, type Painter } from "../painter";
import { flow, flowHeight, placePopover, rule } from "./common";

const WIDTH = 66;

const clip = (value: string, width: number): string => {
  if (width <= 0) return "";
  const chars = [...value];
  return chars.length <= width ? value : `${chars.slice(0, Math.max(1, width - 1)).join("")}…`;
};

const clipLeft = (value: string, width: number): string => {
  if (width <= 0) return "";
  const chars = [...value];
  return chars.length <= width ? value : `…${chars.slice(chars.length - width + 1).join("")}`;
};

export function visibleFileRows(host: Host, screenHeight: number, top: number): number {
  const actions = 3;
  const fixed = 2 + 1 + 1 + 2 + actions;
  return Math.max(1, screenHeight - top - 1 - fixed);
}

export function renderFiles(p: Painter, host: Host, anchorX: number, top: number): void {
  const { pal } = p;
  const actions = [
    { id: "files:new", label: "[new]", action: () => host.newDrawing(), fg: pal.accent },
    { id: "files:rename", label: "[rename]", action: () => host.renameDrawing() },
    { id: "files:fork", label: "[fork]", action: () => host.forkDrawing() },
    { id: "files:import", label: "[text]", action: () => host.browseImportText() },
    { id: "files:media", label: "[media]", action: () => host.browseImportMedia(), fg: pal.success },
    { id: "files:history", label: "[history]", action: () => host.openHistory(), fg: pal.warning },
    {
      id: "files:sort",
      label: host.fileSort === "recent" ? "[sort recent]" : "[sort name]",
      action: () => host.toggleFileSort(),
    },
    { id: "files:clear", label: "[clear]", action: () => host.clearDrawing(), fg: pal.warning },
    { id: "files:delete", label: "[delete]", action: () => host.deleteDrawing(), fg: pal.danger },
  ];
  const query = host.fileQuery.toLowerCase();
  const drawings = host.drawings
    .filter((d) => !query || d.name.toLowerCase().includes(query))
    .sort((a, b) =>
      host.fileSort === "recent"
        ? (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const actionRows = flowHeight(WIDTH, actions.map((a) => a.label));
  const fixed = 2 + 1 + 1 + 2 + actionRows;
  const maxRows = Math.max(1, p.height - top - 1 - fixed);
  const shown = Math.max(1, Math.min(drawings.length, maxRows));
  const h = Math.min(p.height - top - 1, fixed + shown);
  const r = placePopover(p, anchorX, top, WIDTH, h);
  p.panel(r);

  let y = r.y + 1;
  p.text(r.x + 2, y, "search: ", pal.accent);
  const searchX = r.x + 10;
  const queryWidth = r.w - 14;
  p.text(searchX, y, clip(host.fileQuery, queryWidth - 1), pal.text);
  p.cell(searchX + Math.min([...host.fileQuery].length, queryWidth - 1), y, " ", pal.text, pal.selectionBg, ATTR.INVERSE);
  if (drawings.length > shown) {
    const start = Math.min(host.filesScroll, Math.max(0, drawings.length - shown));
    const indicator = ` ${start + 1}-${start + shown}/${drawings.length} `;
    p.text(r.x + r.w - indicator.length - 1, y, indicator, pal.muted);
  }
  y++;

  const start = Math.min(host.filesScroll, Math.max(0, drawings.length - shown));
  if (drawings.length === 0) {
    p.text(r.x + 2, y++, host.fileQuery ? "no matching drawings" : "no drawings yet", pal.muted);
  } else {
    for (const [i, d] of drawings.slice(start, start + shown).entries()) {
      const current = d.path === host.currentPath;
      const size = `${d.size} cells`;
      const nameWidth = Math.max(6, r.w - 6 - size.length);
      const name = clip(d.name, nameWidth);
      const label = `${current ? ">" : " "} ${name.padEnd(nameWidth)} ${size}`;
      p.button(`files:row:${start + i}`, r.x + 1, y, ` ${label} `.slice(0, r.w - 2), () => host.openDrawing(d.path), {
        active: current,
        activeColor: pal.text,
      });
      y++;
    }
  }
  rule(p, r, y++);
  p.text(r.x + 2, y, `dir  `, pal.muted);
  p.text(r.x + 7, y++, clipLeft(host.drawingsDir, r.w - 9), pal.text);
  p.text(r.x + 2, y, `file `, pal.muted);
  p.text(r.x + 7, y++, clipLeft(host.currentPath, r.w - 9), pal.success);
  if (y < r.y + r.h - 1) {
    flow(p, r, y, actions);
  }
}
