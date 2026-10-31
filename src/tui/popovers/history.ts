// `history` popover: autosnapshots for the current drawing, newest first.
import type { Host } from "../host";
import type { Painter } from "../painter";
import { placePopover, rule } from "./common";

const WIDTH = 68;

const when = (ms: number): string => {
  const d = new Date(ms);
  if (!Number.isFinite(ms) || ms <= 0) return "unknown";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export function renderHistory(p: Painter, host: Host, anchorX: number, top: number): void {
  const { pal } = p;
  const entries = host.historyEntries;
  const maxRows = Math.max(3, p.height - top - 7);
  const shown = entries.slice(0, maxRows);
  const r = placePopover(p, anchorX, top, WIDTH, 2 + 1 + Math.max(1, shown.length) + 2);
  p.panel(r);
  let y = r.y + 1;
  p.text(r.x + 2, y++, `history · ${host.drawingName}`, pal.accent, pal.tbBg, 1);
  rule(p, r, y++);
  if (shown.length === 0) {
    p.text(r.x + 2, y, "no snapshots yet — they appear as you edit and save", pal.muted, pal.tbBg, 0, r.x + r.w - 2);
  }
  for (const [i, s] of shown.entries()) {
    const active = i === host.historyIndex;
    const label = ` ${when(s.createdAt)}  ${s.reason.padEnd(12)} ${s.size} cells`;
    p.button(`history:${s.id}`, r.x + 1, y, label.slice(0, r.w - 2), () => host.restoreHistory(s.id), {
      active,
      activeColor: pal.text,
    });
    y++;
  }
  if (entries.length > shown.length) p.text(r.x + r.w - 14, y - 1, ` +${entries.length - shown.length} more`, pal.muted);
  rule(p, r, y++);
  p.text(r.x + 2, y, "click a snapshot to restore · ctrl+z undoes the restore", pal.muted, pal.tbBg, 0, r.x + r.w - 2);
}
