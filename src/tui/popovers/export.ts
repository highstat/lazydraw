// `export` dialog: format, charset, wrapper, font, selection, preview, copy / save.
import { FONT_FAMILIES, WRAPPERS } from "../../core/export";
import type { Host } from "../host";
import type { Painter } from "../painter";
import { flow, flowHeight, placePopover, rule } from "./common";

export function renderExport(p: Painter, host: Host, anchorX: number, top: number): void {
  const { pal } = p;
  const cfg = host.config.export;
  const preview = host.exportPreview().split("\n");
  const previewWidth = Math.max(...preview.map((l) => [...l].length));
  const w = Math.min(p.width, Math.max(72, previewWidth + 4));
  const wrapRows = flowHeight(w, WRAPPERS.map((x) => x.label), "wrap:        ");
  const fontRows = flowHeight(w, [...FONT_FAMILIES], "export font: ");
  const chrome = 2 + 1 + 1 + 1 + wrapRows + 1 + fontRows + 1 + 1 + 2;
  const maxPreview = Math.max(1, p.height - top - 1 - chrome);
  const shown = preview.slice(0, maxPreview);
  const h = chrome + shown.length;
  const r = placePopover(p, anchorX, top, w, h);
  p.panel(r);

  let y = r.y + 1;
  y = flow(
    p,
    r,
    y,
    [
      { id: "exp:format:txt", label: "txt", active: cfg.format === "txt", action: () => host.setExport({ format: "txt" }) },
      { id: "exp:format:svg", label: "svg", active: cfg.format === "svg", action: () => host.setExport({ format: "svg" }) },
      { id: "exp:format:png", label: "png", active: cfg.format === "png", action: () => host.setExport({ format: "png" }) },
      { id: "exp:format:html", label: "html", active: cfg.format === "html", action: () => host.setExport({ format: "html" }) },
      {
        id: "exp:selection",
        label: cfg.selectionOnly ? "[x] selection only" : "[ ] selection only",
        active: cfg.selectionOnly,
        action: () => host.setExport({ selectionOnly: !cfg.selectionOnly }),
      },
    ],
    "format:      ",
  );
  y = flow(
    p,
    r,
    y,
    [
      {
        id: "exp:ext",
        label: "extended",
        active: cfg.characters === "extended",
        action: () => host.setExport({ characters: "extended" }),
      },
      {
        id: "exp:basic",
        label: "basic",
        active: cfg.characters === "basic",
        action: () => host.setExport({ characters: "basic" }),
      },
      {
        id: "exp:fence",
        label: cfg.fenced ? "[x] markdown fence" : "[ ] markdown fence",
        active: cfg.fenced,
        action: () => host.setExport({ fenced: !cfg.fenced }),
      },
    ],
    "characters:  ",
  );
  y = flow(
    p,
    r,
    y,
    WRAPPERS.map((wr) => ({
      id: `exp:wrap:${wr.id}`,
      label: wr.label,
      active: cfg.wrapper === wr.id,
      action: () => host.setExport({ wrapper: wr.id }),
    })),
    "wrap:        ",
  );
  y = flow(
    p,
    r,
    y,
    FONT_FAMILIES.map((font) => ({
      id: `exp:font:${font}`,
      label: font,
      active: cfg.fontFamily === font,
      action: () => host.setExport({ fontFamily: font }),
    })),
    "export font: ",
  );
  y = flow(
    p,
    r,
    y,
    [
      { id: "exp:size-", label: "-", action: () => host.setExport({ fontSize: Math.max(8, cfg.fontSize - 1) }) },
      { id: "exp:size", label: `${cfg.fontSize}px`, active: true, action: () => {} },
      { id: "exp:size+", label: "+", action: () => host.setExport({ fontSize: Math.min(48, cfg.fontSize + 1) }) },
    ],
    "font size:   ",
  );
  if (!host.readOnly) {
    p.text(r.x + 2, y + 1, "terminal font is set by your terminal; this font applies to SVG/HTML", pal.muted, pal.tbBg, 0, r.x + r.w - 2);
  }
  y += 2;
  rule(p, r, y++);
  for (const line of shown) {
    p.text(r.x + 2, y++, line, pal.fg, pal.tbBg, 0, r.x + r.w - 2);
  }
  if (preview.length > shown.length) {
    p.text(r.x + r.w - 16, y - 1, ` +${preview.length - shown.length} lines `, pal.muted);
  }
  rule(p, r, y++);
  let x = r.x + 2;
  x = p.button("exp:copy", x, y, "[copy]", () => host.copyExport(), { fg: pal.success }) + 2;
  x = p.button("exp:markdown", x, y, "[copy markdown]", () => host.copyMarkdown(), { fg: pal.purple }) + 2;
  x = p.button("exp:save", x, y, "[save…]", () => host.saveExportPicker(), { fg: pal.accent }) + 2;
  p.button("exp:save-as", x, y, "save as…", () => host.saveExport(), { fg: pal.muted });
}
