// `settings` popover: appearance, editing, files/saving. Three pages keep a
// narrow terminal readable; every value applies and saves immediately.
import {
  ARROW_STYLES,
  BOX_SHAPES,
  FILE_SORTS,
  GRID_STYLES,
  LINE_STYLES,
  TEXT_FONT_STYLES,
  TEXT_MODES,
  THEME_CHOICES,
} from "../../storage/config";
import { TOOL_IDS } from "../../core/editor";
import type { Host } from "../host";
import type { Painter } from "../painter";
import { flow, flowHeight, placePopover, rule } from "./common";

const WIDTH = 66;
export const SETTINGS_PAGES = 3;

export function settingsHeight(): number {
  return 2 + 1 + flowHeight(WIDTH, [...THEME_CHOICES], "theme: ") + 6;
}

const onOff = (value: boolean) => (value ? "on" : "off");

export function renderSettings(p: Painter, host: Host, anchorX: number, top: number): void {
  const page = ((host.settingsPage % SETTINGS_PAGES) + SETTINGS_PAGES) % SETTINGS_PAGES;
  const h = page === 0 ? settingsHeight() : 24;
  const r = placePopover(p, anchorX, top, WIDTH, Math.min(h, p.height - top - 1));
  p.panel(r);
  const config = host.config;
  let y = r.y + 1;
  p.text(r.x + 2, y++, `settings  ${page + 1}/${SETTINGS_PAGES}`, p.pal.accent, p.pal.tbBg, 1);
  rule(p, r, y++);

  if (page === 0) {
    y = flow(
      p,
      r,
      y,
      GRID_STYLES.map((g) => ({
        id: `settings:grid:${g}`,
        label: g,
        active: config.grid === g,
        action: () => host.setGrid(g),
      })),
      "grid:  ",
    );
    y = flow(
      p,
      r,
      y,
      THEME_CHOICES.map((t) => ({
        id: `settings:theme:${t}`,
        label: t,
        active: config.theme === t,
        action: () => host.setTheme(t),
      })),
      "theme: ",
    );
    y = flow(
      p,
      r,
      y,
      [
        {
          id: "settings:copyOnSelect",
          label: onOff(config.copyOnSelect),
          active: config.copyOnSelect,
          action: () => host.setCopyOnSelect(!config.copyOnSelect),
        },
      ],
      "copy on select: ",
    );
    y = flow(
      p,
      r,
      y,
      [
        {
          id: "settings:cursorBlink",
          label: onOff(config.cursorBlink),
          active: config.cursorBlink,
          action: () => host.updateConfig({ cursorBlink: !config.cursorBlink }),
        },
      ],
      "cursor blink:   ",
    );
    y = flow(
      p,
      r,
      y,
      [1, 2, 3, 5].map((n) => ({
        id: `settings:scroll:${n}`,
        label: `${n}x`,
        active: config.scrollSpeed === n,
        action: () => host.updateConfig({ scrollSpeed: n }),
      })),
      "scroll speed:   ",
    );
  } else if (page === 1) {
    y = flow(
      p,
      r,
      y,
      TEXT_MODES.map((m) => ({
        id: `settings:textMode:${m}`,
        label: m,
        active: config.textMode === m,
        action: () => host.updateConfig({ textMode: m }),
      })),
      "text mode:      ",
    );
    p.text(r.x + 2, y, "  inplace edits labels · layer always writes a new overlay", p.pal.muted, p.pal.tbBg, 0, r.x + r.w - 2);
    y++;
    y = flow(
      p,
      r,
      y,
      [
        {
          id: "settings:insertMode:insert",
          label: "insert",
          active: config.insertMode,
          action: () => host.updateConfig({ insertMode: true }),
        },
        {
          id: "settings:insertMode:overwrite",
          label: "overwrite",
          active: !config.insertMode,
          action: () => host.updateConfig({ insertMode: false }),
        },
      ],
      "typing:         ",
    );
    y = flow(
      p,
      r,
      y,
      TEXT_FONT_STYLES.map((s) => ({
        id: `settings:fontStyle:${s}`,
        label: s,
        active: config.fontStyle === s,
        action: () => host.updateConfig({ fontStyle: s }),
      })),
      "font style:     ",
    );
    y = flow(
      p,
      r,
      y,
      [
        { id: "settings:brush-", label: "-", action: () => host.setBrushSize(config.brushSize - 1) },
        { id: "settings:brush", label: `${config.brushSize}`, active: true, action: () => {} },
        { id: "settings:brush+", label: "+", action: () => host.setBrushSize(config.brushSize + 1) },
        ...[1, 2, 3, 5, 7].map((n) => ({
          id: `settings:brush:${n}`,
          label: `${n}`,
          active: config.brushSize === n,
          action: () => host.setBrushSize(n),
        })),
      ],
      "brush/eraser:   ",
    );
    y = flow(
      p,
      r,
      y,
      BOX_SHAPES.map((s) => ({
        id: `settings:box:${s}`,
        label: s,
        active: config.boxShape === s,
        action: () => host.updateConfig({ boxShape: s }),
      })),
      "box shape:      ",
    );
    y = flow(
      p,
      r,
      y,
      LINE_STYLES.map((s) => ({
        id: `settings:line:${s}`,
        label: s,
        active: config.lineStyle === s,
        action: () => host.updateConfig({ lineStyle: s }),
      })),
      "line style:     ",
    );
    y = flow(
      p,
      r,
      y,
      ARROW_STYLES.map((s) => ({
        id: `settings:arrow:${s}`,
        label: s,
        active: config.arrowStyle === s,
        action: () => host.updateConfig({ arrowStyle: s }),
      })),
      "arrow style:    ",
    );
    y = flow(
      p,
      r,
      y,
      [
        {
          id: "settings:smart",
          label: onOff(config.smartConnectors),
          active: config.smartConnectors,
          action: () => host.updateConfig({ smartConnectors: !config.smartConnectors }),
        },
      ],
      "smart connectors: ",
    );
    y = flow(
      p,
      r,
      y,
      TOOL_IDS.map((t) => ({
        id: `settings:tool:${t}`,
        label: t,
        active: config.defaultTool === t,
        action: () => host.updateConfig({ defaultTool: t }),
      })),
      "default tool:   ",
    );
  } else {
    y = flow(
      p,
      r,
      y,
      [0, 500, 1000, 3000, 10000].map((ms) => ({
        id: `settings:autosave:${ms}`,
        label: ms === 0 ? "off" : ms < 1000 ? `${ms}ms` : `${ms / 1000}s`,
        active: config.autosaveMs === ms,
        action: () => host.updateConfig({ autosaveMs: ms }),
      })),
      "autosave:       ",
    );
    y = flow(
      p,
      r,
      y,
      [0, 60_000, 120_000, 300_000].map((ms) => ({
        id: `settings:snapshot:${ms}`,
        label: ms === 0 ? "off" : `${ms / 60_000}m`,
        active: config.snapshotMs === ms,
        action: () => host.updateConfig({ snapshotMs: ms }),
      })),
      "snapshots:      ",
    );
    y = flow(
      p,
      r,
      y,
      [
        { id: "settings:confirmQuit:on", label: "on", active: config.confirmQuit, action: () => host.updateConfig({ confirmQuit: true }) },
        { id: "settings:confirmQuit:off", label: "off", active: !config.confirmQuit, action: () => host.updateConfig({ confirmQuit: false }) },
      ],
      "confirm quit:   ",
    );
    y = flow(
      p,
      r,
      y,
      FILE_SORTS.map((s) => ({
        id: `settings:fileSort:${s}`,
        label: s,
        active: config.fileSort === s,
        action: () => host.updateConfig({ fileSort: s }),
      })),
      "file sorting:   ",
    );
    y = flow(
      p,
      r,
      y,
      [
        { id: "settings:showPath", label: onOff(config.showPath), active: config.showPath, action: () => host.updateConfig({ showPath: !config.showPath }) },
      ],
      "show file path: ",
    );
    y = flow(
      p,
      r,
      y,
      [
        { id: "settings:paths", label: "[copy path]", action: () => host.copyPath(), fg: p.pal.accent },
        { id: "settings:dirs", label: "[show folders]", action: () => host.showPaths() },
        { id: "settings:history", label: "[history]", action: () => host.openHistory(), fg: p.pal.warning },
        { id: "settings:recenter", label: "[recenter]", action: () => host.recenter(), fg: p.pal.orange },
      ],
    );
  }

  const footer = r.y + r.h - 1;
  if (footer > y) {
    rule(p, r, footer - 1);
    let x = r.x + 2;
    x = p.button("settings:prev", x, footer - 1, "[<]", () => host.setSettingsPage(page - 1)) + 1;
    x = p.button("settings:next", x, footer - 1, "[>]", () => host.setSettingsPage(page + 1)) + 1;
    p.text(x + 1, footer - 1, `page ${page + 1}/${SETTINGS_PAGES}`, p.pal.muted);
    p.button("settings:help", r.x + r.w - 12, footer - 1, "[help]", () => host.activate("help", r.x + 1), {
      fg: p.pal.accent,
    });
  }
}
