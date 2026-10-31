// `Ctrl/Cmd+K` command palette: search and run any command, including tools,
// arrangement actions and file operations whose keys you can customize.
import type { CommandDef } from "../commands";
import { filterCommands, primaryBinding } from "../commands";
import type { Host } from "../host";
import { ATTR, type Painter } from "../painter";
import { placePopover, rule } from "./common";

const WIDTH = 64;

export function paletteCommands(host: Host): CommandDef[] {
  return filterCommands(host.paletteQuery, host.commands);
}

export function renderPalette(p: Painter, host: Host, anchorX: number, top: number): void {
  const { pal } = p;
  const commands = paletteCommands(host);
  const maxRows = Math.max(3, p.height - top - 9);
  const shown = commands.slice(0, maxRows);
  const h = 2 + 1 + 1 + Math.max(1, shown.length) + 1 + 1;
  const r = placePopover(p, anchorX, top, WIDTH, h);
  p.panel(r);
  let y = r.y + 1;
  p.text(r.x + 2, y, "> ", pal.accent);
  const queryX = r.x + 4;
  p.text(queryX, y, host.paletteQuery, pal.text, pal.tbBg, 0, r.x + r.w - 3);
  p.cell(queryX + [...host.paletteQuery].length, y, " ", pal.text, pal.selectionBg, ATTR.INVERSE);
  y++;
  rule(p, r, y++);
  if (shown.length === 0) {
    p.text(r.x + 2, y, "no matching commands", pal.muted);
  }
  const selected = Math.min(Math.max(0, host.paletteIndex), Math.max(0, shown.length - 1));
  for (const [i, c] of shown.entries()) {
    const group = c.group.padEnd(8);
    const binding = host.config.keymap[c.id] ?? commandBinding(c);
    const line = ` ${group} ${c.label}`;
    p.button(`palette:${c.id}`, r.x + 1, y, line.slice(0, r.w - 13), () => host.runCommand(c.id), {
      active: i === selected,
      activeColor: pal.text,
    });
    if (binding) p.text(r.x + r.w - binding.length - 2, y, binding, pal.muted);
    y++;
  }
  if (commands.length > shown.length) p.text(r.x + r.w - 14, y - 1, ` +${commands.length - shown.length} more`, pal.muted);
  rule(p, r, y++);
  p.text(r.x + 2, y, "type to filter · ↑↓ choose · enter run · esc close", pal.muted, pal.tbBg, 0, r.x + r.w - 2);
}

function commandBinding(c: CommandDef): string {
  return c.binding ? primaryBinding(c.binding) : "";
}
