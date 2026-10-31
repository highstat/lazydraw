// The terminal app: one full-screen surface that paints the canvas, toolbar,
// popovers and dialogs, and routes mouse/keyboard input (§3.5, §5, §6).
import { readFileSync, unwatchFile, watchFile, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import {
  type CliRenderer,
  type KeyEvent,
  type MouseEvent,
  type OptimizedBuffer,
  type PasteEvent,
  Renderable,
  type RenderContext,
} from "@opentui/core";
import { Canvas } from "../core/canvas";
import type { Box } from "../core/box";
import { sameBox } from "../core/connector";
import { Editor, TOOL_IDS, type ToolId } from "../core/editor";
import { findBox } from "../core/entity";
import { type ExportConfig, exportText, renderExport, type RenderedExport } from "../core/export";
import type { Layer } from "../core/layer";
import { mediaToLayer } from "../core/media";
import { generateTable } from "../core/table";
import { textSize, textToLayer } from "../core/text";
import { KEY, mods, type HoverHint, type Mods } from "../core/tools/tool";
import { Vector } from "../core/vector";
import {
  BOX_SHAPES,
  type Config,
  type FileSort,
  type GridStyle,
  LINE_STYLES,
  saveConfig,
  TEXT_FONT_STYLES,
  type TextMode,
  type ThemeChoice,
} from "../storage/config";
import { type DrawingInfo, type DrawingStore, slugify } from "../storage/drawings";
import { HistoryStore, type Snapshot } from "../storage/history";
import { defaultExportName, nativeFilePicker } from "../storage/picker";
import { renderCanvas, Viewport } from "./canvas-view";
import { COMMANDS, type CommandDef, commandMatches, filterCommands } from "./commands";
import type { Dialog, Host, InputDialog } from "./host";
import { altDigit, isCtrl, normalizeKeyEvent, printable, toolKey } from "./input";
import { type Hotspot, hotspotAt, inRect, Painter, type Rect } from "./painter";
import { renderDialog } from "./popovers/dialog";
import { renderExport as renderExportPanel } from "./popovers/export";
import { renderFiles } from "./popovers/files";
import { renderHelp } from "./popovers/help";
import { renderHistory } from "./popovers/history";
import { renderMenu } from "./popovers/menu";
import { renderPalette } from "./popovers/palette";
import { renderSettings } from "./popovers/settings";
import { detectTerminalColors, palette, type Palette, type TerminalColors } from "./theme";
import { type ItemId, layoutToolbar, type PanelId, renderToolbar, type ToolbarHost, type ToolbarLayout } from "./toolbar";

export interface OpenDrawing {
  path: string;
  name: string;
  layer: Layer;
  createdAt: string;
}

export interface Clipboard {
  copy(text: string): void;
  paste(): string | null;
}

export interface AppOptions {
  renderer: CliRenderer;
  store: DrawingStore;
  config: Config;
  configPath?: string;
  drawing: OpenDrawing;
  clipboard: Clipboard;
  /** The terminal's colors, if startup already read them; otherwise the app reads them itself. */
  term?: TerminalColors | null;
  onQuit(): void;
  /** Autosave debounce in ms (§7). */
  autosaveMs?: number;
  /** Viewer mode: canvas can be panned, but nothing can be edited. */
  readOnly?: boolean;
  /** Reload the drawing when another process changes the file. */
  watch?: boolean;
}

const CHIP_MS = 1500;
/** How long a first ctrl+c stays armed, waiting for the second one. */
const QUIT_CONFIRM_MS = 3000;
const TOAST_MS = 2500;
const SPACE_PAN_MS = 1000;

const IS_MAC = process.platform === "darwin";

/** Cmd on macOS, Ctrl elsewhere. Ctrl+<key> keeps working on macOS too. */
const anyPrimary = (k: KeyEvent, name: string): boolean =>
  k.name === name && (k.ctrl || (IS_MAC && (!!k.meta || !!k.super))) && !k.option;

type Mode =
  | { kind: "none" }
  | { kind: "draw"; start: Vector; last: Vector; moved: boolean }
  | { kind: "pan"; sx: number; sy: number; origin: Vector };

const TOOL_HINT: Record<ToolId, string> = {
  box: "drag to draw a box · [ ] shape",
  select: "drag to select or move · del erases · ctrl+c/x/v · ctrl+a all · ctrl+d duplicate",
  arrow: "drag to draw an arrow · click two boxes to connect · f flips",
  line: "drag to draw a line · press f to flip",
  text: "click to place the cursor, then type · settings → text mode",
  eraser: "drag to erase · [ ] brush size",
  pencil: "drag to draw freehand · [ ] brush size",
};

const TOOL_SHORTCUT: Record<string, ToolId> = {
  r: "box",
  v: "select",
  a: "arrow",
  l: "line",
  t: "text",
  e: "eraser",
  p: "pencil",
};

class Surface extends Renderable {
  constructor(
    ctx: RenderContext,
    private readonly app: App,
  ) {
    super(ctx, {
      id: "lazydraw",
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      onMouse: (e) => app.onMouse(e),
    });
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    this.app.paint(buffer, this.width, this.height);
  }
}

export class App implements Host, ToolbarHost {
  readonly editor = new Editor();
  readonly viewport = new Viewport();
  readonly config: Config;
  drawings: DrawingInfo[] = [];
  panel: PanelId | null = null;

  private readonly renderer: CliRenderer;
  private readonly store: DrawingStore;
  private readonly opts: AppOptions;
  private readonly surface: Surface;
  private drawing: OpenDrawing;
  private unsubscribe: () => void = () => {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private panelAnchor = 0;
  private dialog: Dialog | null = null;
  private toastMessage: { text: string; until: number } | null = null;
  private chipsUntil = 0;
  /** When set, a ctrl+c before this moment quits; a first ctrl+c arms it. */
  private quitArmed = 0;
  /** The last text sent to the clipboard, so re-selecting the same cells does not resend it. */
  private lastCopy: string | null = null;
  private hotspots: Hotspot[] = [];
  private chrome: Rect[] = [];
  private pressed: string | null = null;
  private mode: Mode = { kind: "none" };
  private hover: { x: number; y: number } | null = null;
  private hint: HoverHint = "default";
  private flipToggle = false;
  private lastMods: Mods = mods();
  /** Space presses in a row; terminals rarely report releases, so holding is inferred from repeats. */
  private spaceRun = { count: 0, until: 0 };
  private placing: Layer | null = null;
  private width = 0;
  private height = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  /** The terminal's own colors, once detected. */
  private term: TerminalColors | null = null;
  private recenterSoon = true;
  filesScroll = 0;
  private panelScroll = 0;
  /** First box of a click-click smart connector, if any. */
  private connectorSource: Box | null = null;
  readonly readOnly: boolean;
  private fileSearch = "";
  private settingsPageIndex = 0;
  showAllThemes = false;
  private readonly history = new HistoryStore();
  private historyList: Snapshot[] = [];
  private historyCursor = 0;
  private paletteSearch = "";
  private paletteCursor = 0;
  /** Last snapshot time, used to throttle automatic snapshots. */
  private lastSnapshot = 0;
  /** mtime of the last save we wrote, so file watching ignores our own writes. */
  private lastSaveMtime = 0;
  private watcher: ((curr: { mtimeMs: number }, prev: { mtimeMs: number }) => void) | null = null;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: AppOptions) {
    this.opts = opts;
    this.renderer = opts.renderer;
    this.store = opts.store;
    this.config = opts.config;
    this.drawing = opts.drawing;
    this.term = opts.term ?? null;
    this.readOnly = opts.readOnly === true;
    this.applyRuntimeConfig();
    this.attachCanvas(new Canvas(opts.drawing.layer));

    this.surface = new Surface(this.renderer, this);
    this.renderer.root.add(this.surface);
    this.renderer.keyInput.on("keypress", (k) => this.onKey(k));
    this.renderer.keyInput.on("keyrelease", (k) => {
      if (k.name === "space") this.spaceRun = { count: 0, until: 0 };
    });
    this.renderer.keyInput.on("paste", (e) => this.onPaste(e));
    this.renderer.on("resize", () => this.requestRender());
    this.applyTheme();
    if (!this.term) void this.readTerminalColors();
    if (!this.readOnly) this.editor.setTool(this.config.defaultTool);
    this.watchDrawing(opts.watch === true);
    this.blinkTimer = setInterval(() => {
      if (this.config.cursorBlink && (this.editor.textEntry || this.editor.tool === "text")) this.requestRender();
    }, 500);
  }

  /** Watches the current file and reloads it when another process writes it. */
  private watchDrawing(on: boolean): void {
    if (this.watcher) {
      unwatchFile(this.drawing.path, this.watcher);
      this.watcher = null;
    }
    if (!on) return;
    this.lastSaveMtime = this.store.modifiedAt(this.drawing.path);
    this.watcher = (curr) => {
      if (curr.mtimeMs <= this.lastSaveMtime) return;
      if (this.dirty || this.saveTimer) return;
      try {
        const { file, layer } = this.store.loadSync(this.drawing.path);
        this.editor.cancelGesture();
        this.editor.flush();
        this.attachCanvas(new Canvas(layer));
        this.drawing = { ...this.drawing, name: file.name, createdAt: file.createdAt };
        this.lastSaveMtime = curr.mtimeMs;
        this.recenterSoon = true;
        this.toast("reloaded from disk");
      } catch {
        // A half-written file; the next change event will pick it up.
      }
    };
    watchFile(this.drawing.path, { interval: 1000 }, this.watcher);
  }

  /** Copies config values that change tool behaviour into the editor. */
  private applyRuntimeConfig(): void {
    this.editor.brushSize = this.config.brushSize;
    this.editor.textMode = this.config.textMode;
    this.editor.insertMode = this.config.insertMode;
    this.editor.fontStyle = this.config.fontStyle;
    this.editor.style = {
      line: this.config.lineStyle,
      arrow: this.config.arrowStyle,
      box: this.config.boxShape,
    };
  }

  // ---------------------------------------------------------------- state

  get tool(): ToolId {
    return this.editor.tool;
  }
  get canUndo(): boolean {
    return this.editor.canvas.canUndo || (this.editor.textEntry && this.editor.canvas.scratch.size() > 0);
  }
  get canRedo(): boolean {
    return this.editor.canvas.canRedo;
  }
  get showChips(): boolean {
    return this.panel === "help" || Date.now() < this.chipsUntil;
  }
  get drawingName(): string {
    return this.drawing.name;
  }
  get currentPath(): string {
    return this.drawing.path;
  }
  get drawingsDir(): string {
    return this.store.dir;
  }
  get fileQuery(): string {
    return this.fileSearch;
  }
  get fileSort(): FileSort {
    return this.config.fileSort;
  }
  get historyEntries(): Snapshot[] {
    return this.historyList;
  }
  get historyIndex(): number {
    return this.historyCursor;
  }
  get settingsPage(): number {
    return this.settingsPageIndex;
  }
  get commands(): readonly CommandDef[] {
    return COMMANDS;
  }
  get paletteQuery(): string {
    return this.paletteSearch;
  }
  get paletteIndex(): number {
    return this.paletteCursor;
  }

  private get pal(): Palette {
    return palette(this.config.theme, this.term);
  }

  /**
   * Reads the terminal's palette for a theme that inherits it. Startup normally has the answer
   * before the first frame; this covers terminals too slow for that and themes switched to
   * `terminal` later on.
   */
  private async readTerminalColors(): Promise<void> {
    const term = await detectTerminalColors(this.renderer);
    if (!term) return;
    this.term = term;
    this.applyTheme();
  }

  private applyTheme() {
    this.renderer.setBackgroundColor(this.pal.bg);
    this.requestRender();
  }

  requestRender(): void {
    this.renderer.requestRender();
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  toast(text: string): void {
    this.toastMessage = { text, until: Date.now() + TOAST_MS };
    this.later(TOAST_MS + 10, () => this.requestRender());
    this.requestRender();
  }

  private attachCanvas(canvas: Canvas) {
    this.unsubscribe();
    this.editor.setCanvas(canvas);
    this.unsubscribe = canvas.onChange((committed) => {
      if (committed) this.scheduleSave();
      this.requestRender();
    });
  }

  // ---------------------------------------------------------------- saving

  private scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const delay = this.config.autosaveMs;
    if (delay <= 0) {
      this.saveTimer = null;
      return;
    }
    this.saveTimer = setTimeout(() => this.save(), delay);
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.editor.flush();
    try {
      this.store.save(this.drawing.path, this.drawing.name, this.editor.canvas.committed, this.drawing.createdAt);
      this.lastSaveMtime = this.store.modifiedAt(this.drawing.path);
      this.maybeSnapshot();
      this.dirty = false;
    } catch (e) {
      this.toast(`save failed: ${(e as Error).message}`);
    }
  }

  /** Writes an automatic version snapshot, at most once per configured interval. */
  private maybeSnapshot(reason = "auto"): void {
    const interval = this.config.snapshotMs;
    if (interval <= 0 || this.readOnly) return;
    const now = Date.now();
    if (now - this.lastSnapshot < interval) return;
    if (this.editor.canvas.committed.size() === 0) return;
    this.lastSnapshot = now;
    this.history.snapshot(this.drawing.name, this.editor.canvas.committed, reason);
    this.history.prune(this.drawing.name, this.config.historyLimit);
  }

  private persistConfig() {
    saveConfig(this.config, this.opts.configPath);
  }

  /** Commits pending edits and writes everything to disk. */
  shutdown(): void {
    this.editor.cancelGesture();
    this.editor.flush();
    if (this.dirty || this.saveTimer) this.save();
    if (this.watcher) unwatchFile(this.drawing.path, this.watcher);
    this.config.lastDrawing = this.drawing.path;
    this.persistConfig();
    for (const t of this.timers) clearTimeout(t);
    if (this.blinkTimer) clearInterval(this.blinkTimer);
    this.unsubscribe();
  }

  /** Copies a finished selection. Off by default; the `settings` panel turns it on. */
  private autoCopy(): void {
    if (!this.config.copyOnSelect || this.tool !== "select") return;
    const text = this.editor.select.copySelection();
    // Re-selecting or moving the same cells yields the same text; leave the clipboard alone.
    if (!text || text === this.lastCopy) return;
    this.lastCopy = text;
    this.opts.clipboard.copy(text);
  }

  /** First ctrl+q arms the prompt in the status bar; a second one within the window quits. */
  private armQuit(): void {
    if (!this.config.confirmQuit) return this.quit();
    if (Date.now() < this.quitArmed) return this.quit();
    this.quitArmed = Date.now() + QUIT_CONFIRM_MS;
    this.later(QUIT_CONFIRM_MS + 10, () => this.requestRender());
  }

  quit(): void {
    this.shutdown();
    this.opts.onQuit();
  }

  // ---------------------------------------------------------------- painting

  paint(buffer: OptimizedBuffer, width: number, height: number): void {
    this.width = width;
    this.height = height;
    const layout = layoutToolbar(width);
    if (this.recenterSoon) {
      this.recenterSoon = false;
      this.viewport.recenter(this.editor, width, height, layout.bottom + 1);
    }
    const p = new Painter(buffer, this.pal, width, height, this.hover);
    const hoverCell = this.hover ? this.viewport.toCanvas(this.hover.x, this.hover.y) : null;
    renderCanvas(p, {
      editor: this.editor,
      viewport: this.viewport,
      grid: this.config.grid,
      hoverCell,
      hoverHint: this.hint,
      cursorOn: !this.config.cursorBlink || Math.floor(Date.now() / 500) % 2 === 0,
    });
    renderToolbar(p, this, layout);
    this.paintFloatingContextBar(p, layout);
    if (this.panel) {
      const render = {
        files: renderFiles,
        export: renderExportPanel,
        settings: renderSettings,
        help: renderHelp,
        menu: renderMenu,
        history: renderHistory,
        palette: renderPalette,
      }[this.panel];
      render?.(p, this, this.panelAnchor, layout.bottom);
    }
    this.paintStatus(p);
    if (this.dialog) {
      const before = p.hotspots.length;
      renderDialog(
        p,
        this.dialog,
        () => this.submitDialog(),
        () => this.closeDialog(),
      );
      // The dialog is modal: only its own buttons are live.
      p.hotspots = p.hotspots.slice(before);
    }
    this.hotspots = p.hotspots;
    this.chrome = p.chrome;
  }

  private paintFloatingContextBar(p: Painter, layout: ToolbarLayout) {
    const sel = this.editor.canvas.selection;
    if (!sel || this.editor.drawing || this.dialog || this.panel) return;

    const screenLeft = sel.left() - this.viewport.origin.x;
    const screenTop = sel.top() - this.viewport.origin.y;
    const screenRight = sel.right() - this.viewport.origin.x;
    const screenBottom = sel.bottom() - this.viewport.origin.y;

    if (screenRight < 0 || screenLeft >= this.width || screenBottom < layout.bottom || screenTop >= this.height - 1) {
      return;
    }

    const { pal } = p;
    const shapeBtn = `[Shape: ${this.config.boxShape}]`;
    const styleBtn = `[Style: ${this.config.lineStyle}]`;
    const dupBtn = "[Dup]";
    const alignBtn = "[Align]";
    const delBtn = "[Del]";

    const contentWidth =
      shapeBtn.length + 1 + styleBtn.length + 1 + dupBtn.length + 1 + alignBtn.length + 1 + delBtn.length + 2;
    const barW = Math.min(this.width - 2, contentWidth);
    const barH = 1;

    let barY = screenTop - 1;
    if (barY <= layout.bottom) {
      barY = screenBottom + 1;
    }
    if (barY >= this.height - 1) {
      barY = this.height - 2;
    }
    if (barY <= layout.bottom) {
      barY = layout.bottom + 1;
    }

    let barX = Math.round(screenLeft + (sel.width() - barW) / 2);
    barX = Math.max(1, Math.min(this.width - barW - 1, barX));

    p.fill({ x: barX, y: barY, w: barW, h: barH }, pal.tbBg);
    p.chrome.push({ x: barX, y: barY, w: barW, h: barH });

    let curX = barX + 1;
    curX = p.button("minibar:shape", curX, barY, shapeBtn, () => this.cycleBoxShape(), {
      fg: pal.accent,
      bg: pal.tbBg,
    });
    curX += 1;
    curX = p.button("minibar:style", curX, barY, styleBtn, () => this.cycleLineStyle(), {
      fg: pal.accent,
      bg: pal.tbBg,
    });
    curX += 1;
    curX = p.button("minibar:dup", curX, barY, dupBtn, () => this.duplicateSelection(), {
      fg: pal.tbLabel,
      bg: pal.tbBg,
    });
    curX += 1;
    curX = p.button(
      "minibar:align",
      curX,
      barY,
      alignBtn,
      () => {
        this.editor.select.align("center");
        this.toast("aligned center");
      },
      {
        fg: pal.tbLabel,
        bg: pal.tbBg,
      },
    );
    curX += 1;
    curX = p.button(
      "minibar:del",
      curX,
      barY,
      delBtn,
      () => {
        this.editor.select.eraseSelection();
        this.toast("deleted selection");
      },
      {
        fg: pal.warning,
        bg: pal.tbBg,
      },
    );
  }

  private paintStatus(p: Painter) {
    const { pal } = p;
    const y = this.height - 1;
    if (y < 5) return;
    p.fill({ x: 0, y, w: this.width, h: 1 }, pal.bg);
    let hint = TOOL_HINT[this.tool];
    if (this.readOnly) hint = "read-only view · drag to pan · ctrl+e export · ctrl+k commands";
    else if (this.placing) hint = "click to place the imported text · esc cancels";
    else if (this.editor.textEntry) hint = "typing · enter: new line · esc: done · ctrl+z: undo keystroke";
    else if (this.editor.drawing && (this.tool === "arrow" || this.tool === "line")) {
      hint = `press f to flip${this.flipToggle ? " · flipped" : ""}`;
    } else if (this.tool === "box") {
      hint = `drag to draw a box · b: [${this.config.boxShape}] · s: [${this.config.lineStyle}]`;
    } else if (this.tool === "arrow" || this.tool === "line") {
      hint = `drag to draw ${this.tool} · s: [${this.config.lineStyle}] · f flips`;
    } else if (this.tool === "eraser" || this.tool === "pencil") {
      hint = `drag to ${this.tool === "eraser" ? "erase" : "draw freehand"} · [ ] brush size: ${this.config.brushSize}`;
    }
    // Every transient notice shares one slot: the hint's place, in the prompt's color. The quit
    // prompt outranks a toast, since it is the one the next keystroke acts on.
    const toast = this.toastMessage && Date.now() < this.toastMessage.until ? this.toastMessage.text : null;
    const message = Date.now() < this.quitArmed ? "press ctrl+q again to exit" : toast;
    const badge = this.readOnly ? "  ·  read-only" : "";
    const rawRight = this.config.showPath
      ? `${this.drawing.name}${this.dirty ? " •" : ""} · ${this.drawing.path}${badge}`
      : `${this.drawing.name}${this.dirty ? " •" : ""}  ·  lazydraw${badge}`;
    const right = rawRight.length > Math.max(24, Math.floor(this.width * 0.62)) ? `…${rawRight.slice(-(Math.max(24, Math.floor(this.width * 0.62)) - 1))}` : rawRight;
    const rx = Math.max(0, this.width - right.length - 1);
    p.text(1, y, message ?? hint, message ? pal.warning : pal.muted, pal.bg, 0, rx - 2);
    p.text(rx, y, right, pal.muted, pal.bg);

    if (!message && this.tool === "box" && !this.readOnly && !this.editor.textEntry) {
      const shapePrefix = "drag to draw a box · b: ";
      const shapeLabel = `[${this.config.boxShape}]`;
      const shapeX = 1 + shapePrefix.length;
      p.hotspots.push({
        id: "status:cycleBoxShape",
        x: shapeX,
        y,
        w: shapeLabel.length,
        h: 1,
        action: () => this.cycleBoxShape(),
      });
      const stylePrefix = " · s: ";
      const styleX = shapeX + shapeLabel.length + stylePrefix.length;
      const styleLabel = `[${this.config.lineStyle}]`;
      p.hotspots.push({
        id: "status:cycleLineStyle",
        x: styleX,
        y,
        w: styleLabel.length,
        h: 1,
        action: () => this.cycleLineStyle(),
      });
    }

    p.chrome.push({ x: 0, y, w: this.width, h: 1 });
  }

  // ---------------------------------------------------------------- mouse

  private mouseMods(e: MouseEvent): Mods {
    const m = mods({ ctrl: e.modifiers.ctrl, alt: e.modifiers.alt, shift: e.modifiers.shift });
    return { ...m, flip: m.flip !== this.flipToggle };
  }

  /** Space is held: once outside text entry, or repeating while typing. */
  private get spaceHeld(): boolean {
    const need = this.editor.textEntry ? 2 : 1;
    return Date.now() < this.spaceRun.until && this.spaceRun.count >= need;
  }

  private overChrome(x: number, y: number): boolean {
    return this.chrome.some((r) => inRect(r, x, y));
  }

  onMouse(e: MouseEvent): void {
    switch (e.type) {
      case "scroll":
        return this.onScroll(e);
      case "move":
      case "drag":
        return this.onMove(e);
      case "down":
        return this.onDown(e);
      case "up":
        return this.onUp(e);
    }
  }

  private onScroll(e: MouseEvent) {
    if (this.dialog || !e.scroll) return;
    if (this.panel && this.overChrome(e.x, e.y)) {
      const n = Math.max(1, Math.round(e.scroll.delta || 1)) * this.config.scrollSpeed;
      const dir = e.scroll.direction;
      if (this.panel === "files") {
        if (dir === "up" || dir === "down") this.scrollFiles(dir === "up" ? -n : n);
      } else {
        if (dir === "up") this.panelScroll = Math.max(0, this.panelScroll - n);
        if (dir === "down") this.panelScroll += n;
        this.requestRender();
      }
      return;
    }
    const n = Math.max(1, Math.round(e.scroll.delta || 1)) * this.config.scrollSpeed;
    const dir = e.scroll.direction;
    if (dir === "left" || dir === "right") {
      const sign = dir === "left" ? -1 : 1;
      this.viewport.pan(sign * 2 * n, 0);
    } else {
      this.viewport.pan(0, (dir === "up" ? -1 : 1) * n);
    }
    this.refreshHover(e);
  }

  private refreshHover(e: MouseEvent) {
    this.hover = { x: e.x, y: e.y };
    const cell = this.viewport.toCanvas(e.x, e.y);
    if (this.placing) this.showPlacing(cell);
    this.hint = this.tool === "select" && !this.overChrome(e.x, e.y) ? this.editor.hoverHint(cell, this.mouseMods(e)) : "default";
    this.requestRender();
  }

  private onMove(e: MouseEvent) {
    const mode = this.mode;
    if (mode.kind === "pan") {
      this.viewport.origin = new Vector(mode.origin.x - (e.x - mode.sx), mode.origin.y - (e.y - mode.sy));
    } else if (mode.kind === "draw") {
      const cell = this.viewport.toCanvas(e.x, e.y);
      this.lastMods = this.mouseMods(e);
      if (!cell.equals(mode.last)) {
        mode.last = cell;
        mode.moved = true;
        this.editor.move(cell, this.lastMods);
      }
    }
    this.refreshHover(e);
  }

  private onDown(e: MouseEvent) {
    this.hover = { x: e.x, y: e.y };
    const hot = hotspotAt(this.hotspots, e.x, e.y);
    this.pressed = hot?.id ?? null;
    if (hot || this.dialog) return;
    if (this.overChrome(e.x, e.y)) return;
    if (this.panel) {
      // A click outside a popover only closes it.
      this.closePanel();
      return;
    }
    if (this.editor.textEntry) {
      this.editor.flush();
    }
    if (this.mode.kind !== "none") return;
    const cell = this.viewport.toCanvas(e.x, e.y);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (this.spaceHeld || e.modifiers.alt))) {
      if (e.button === 0 && this.editor.textEntry) {
        // The held space was typed into the text; take it back.
        for (let i = 0; i < this.spaceRun.count && this.editor.text.lastTypedSpace; i++) {
          this.editor.text.undoKeystroke();
        }
      }
      this.mode = { kind: "pan", sx: e.x, sy: e.y, origin: this.viewport.origin };
      return;
    }
    if (e.button !== 0) return;
    if (this.readOnly) return;
    if (this.placing) {
      this.showPlacing(cell);
      this.editor.canvas.commitScratch();
      this.placing = null;
      this.toast("imported");
      return;
    }
    this.flipToggle = false;
    this.lastMods = this.mouseMods(e);
    this.mode = { kind: "draw", start: cell, last: cell, moved: false };
    this.editor.down(cell, this.lastMods);
    this.requestRender();
  }

  private onUp(e: MouseEvent) {
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed) {
      const hot = hotspotAt(this.hotspots, e.x, e.y);
      if (hot?.id === pressed) {
        if (hot.id === "box" && this.tool === "box") {
          this.cycleBoxShape();
        } else {
          hot.action();
        }
      }
      this.requestRender();
      return;
    }
    if (this.mode.kind === "draw") {
      const clickConnect =
        this.tool === "arrow" &&
        this.config.smartConnectors &&
        e.button === 0 &&
        !this.mode.moved &&
        !this.readOnly;
      if (clickConnect) {
        // A click with the arrow tool is a smart-connector pick, not a zero-length arrow.
        this.editor.cancelGesture();
        this.smartConnectorClick(this.viewport.toCanvas(e.x, e.y));
      } else {
        this.editor.up();
        this.autoCopy();
      }
    }
    this.mode = { kind: "none" };
    this.flipToggle = false;
    this.refreshHover(e);
  }

  /** Click-click connector: first box is the source, second routes and commits. */
  private smartConnectorClick(cell: Vector): void {
    const box = findBox(this.editor.canvas.committed, cell);
    if (!box) {
      this.connectorSource = null;
      this.editor.canvas.clearSelection();
      return this.toast("click a box to connect");
    }
    if (!this.connectorSource) {
      this.connectorSource = box;
      this.editor.canvas.setSelection(box);
      return this.toast("connector source · click the target box");
    }
    if (sameBox(this.connectorSource, box)) {
      this.editor.canvas.setSelection(box);
      return this.toast("pick a different target box");
    }
    const ok = this.editor.connectBoxes(this.connectorSource, box);
    this.connectorSource = null;
    this.editor.canvas.clearSelection();
    this.toast(ok ? "connected · boxes will stay linked" : "no clear route between those boxes");
  }

  // ---------------------------------------------------------------- keyboard

  private onKey(k: KeyEvent) {
    try {
      this.handleKey(normalizeKeyEvent(k));
    } finally {
      this.requestRender();
    }
  }

  private handleKey(k: KeyEvent) {
    if (this.dialog) return this.dialogKey(k);

    // Popovers that capture typing/arrows before global shortcuts.
    if (this.panel === "palette") return this.paletteKey(k);
    if (this.panel === "files" && this.filePanelKey(k)) return;
    if (this.panel === "history" && this.historyPanelKey(k)) return;

    if (k.name === "escape") return this.escape();

    if (this.editor.textEntry) {
      if (anyPrimary(k, "q")) return this.armQuit();
      if (anyPrimary(k, "z") || (k.ctrl && k.name === "z")) return void (k.shift ? this.redo() : this.undo());
      if (anyPrimary(k, "y") || (k.ctrl && k.name === "y")) return void this.redo();
      if (anyPrimary(k, "s") || (k.ctrl && k.name === "s")) {
        if (this.readOnly) return this.toast("read-only");
        this.editor.flush();
        this.save();
        return this.toast(`saved · ${this.drawing.path}`);
      }
      const key = toolKey(k);
      if (key) this.editor.key(key, mods({ ctrl: k.ctrl, alt: k.option, shift: k.shift }));
      return;
    }

    // Every configured/default command binding. User overrides in config.keymap win.
    for (const command of COMMANDS) {
      if (!command.binding && !this.config.keymap[command.id]) continue;
      if (commandMatches(k, command.id, this.config.keymap)) return this.runCommand(command.id);
    }

    const digit = altDigit(k);
    if (digit) return this.setTool(TOOL_IDS[digit - 1]!);

    const key = toolKey(k);

    // Mid-drag: `f` flips line/arrow/select elbows; other keys go to the tool.
    if (this.editor.drawing && this.mode.kind === "draw") {
      if (key === "f") {
        this.flipToggle = !this.flipToggle;
        this.lastMods = { ...this.lastMods, flip: !this.lastMods.flip };
        if (this.tool === "select") this.editor.move(this.mode.last, this.lastMods);
        else this.editor.key("", this.lastMods);
        return;
      }
      if (key) this.editor.key(key, this.lastMods);
      return;
    }

    if (k.name === "space") {
      const now = Date.now();
      this.spaceRun = { count: now < this.spaceRun.until ? this.spaceRun.count + 1 : 1, until: now + SPACE_PAN_MS };
      if (!this.editor.textEntry) return;
    } else {
      this.spaceRun = { count: 0, until: 0 };
    }

    if (this.editor.textEntry) {
      if (key) this.editor.key(key, mods({ ctrl: k.ctrl, alt: k.option, shift: k.shift }));
      return;
    }

    // Keyboard navigation: arrows pan, or nudge a selection when select has one.
    const speed = Math.max(1, this.config.scrollSpeed);
    const panStepX = (k.shift ? 8 : 2) * speed;
    const panStepY = (k.shift ? 6 : 1) * speed;
    const pan = (dx: number, dy: number) => {
      this.viewport.pan(dx, dy);
      this.requestRender();
    };
    if (key === KEY.UP || key === KEY.DOWN || key === KEY.LEFT || key === KEY.RIGHT) {
      if (this.tool === "select" && this.editor.select.hasSelection && !k.ctrl && !k.option) {
        if (this.editor.key(key, mods({ ctrl: k.ctrl, alt: k.option, shift: k.shift }))) return;
      }
      if (key === KEY.UP) return pan(0, -panStepY);
      if (key === KEY.DOWN) return pan(0, panStepY);
      if (key === KEY.LEFT) return pan(-panStepX, 0);
      return pan(panStepX, 0);
    }
    if (key === KEY.HOME) return this.recenter();
    if (key === KEY.PAGE_UP) return pan(0, -Math.max(1, this.height - 6));
    if (key === KEY.PAGE_DOWN) return pan(0, Math.max(1, this.height - 6));

    if (
      key === "[" ||
      key === "]" ||
      key === "х" ||
      key === "ъ" ||
      key === "Х" ||
      key === "Ъ" ||
      key === "-" ||
      key === "+" ||
      key === "="
    ) {
      const delta = key === "]" || key === "ъ" || key === "Ъ" || key === "+" || key === "=" ? 1 : -1;
      const next = Math.max(1, Math.min(9, this.config.brushSize + delta));
      return this.setBrushSize(next);
    }

    if (this.tool === "box" && (key === "b" || key === "и")) {
      return this.cycleBoxShape();
    }
    if ((this.tool === "box" || this.tool === "line" || this.tool === "arrow") && (key === "s" || key === "ы")) {
      return this.cycleLineStyle();
    }

    const ch = printable(k);
    if (ch && /^[1-7]$/.test(ch)) return this.setTool(TOOL_IDS[Number(ch) - 1]!);
    const letterTool = ch ? TOOL_SHORTCUT[ch] : undefined;
    if (letterTool) return this.setTool(letterTool);
    if (ch === "?") return this.togglePanel("help", this.anchorOf("help"));

    if (this.readOnly) {
      if (this.panel) return this.closePanel();
      return;
    }

    if (this.tool === "select" && key) {
      this.editor.key(key, mods({ ctrl: k.ctrl, alt: k.option, shift: k.shift }));
      return;
    }
  }

  private escape() {
    if (this.panel) return this.closePanel();
    if (this.connectorSource) {
      this.connectorSource = null;
      this.editor.canvas.clearSelection();
      return this.toast("connector cancelled");
    }
    if (this.placing) {
      this.placing = null;
      this.editor.canvas.clearScratch();
      return;
    }
    if (this.mode.kind === "draw") {
      this.editor.cancelGesture();
      this.mode = { kind: "none" };
      return;
    }
    if (this.editor.textEntry) return this.editor.text.commit();
    if (this.editor.canvas.selection) this.editor.select.cleanup();
  }

  /** Typing in the files panel filters the list; arrows scroll it. */
  private filePanelKey(k: KeyEvent): boolean {
    if (k.name === "return" || k.name === "enter") {
      const query = this.fileSearch.toLowerCase();
      const drawings = this.store
        .list()
        .filter((d) => !query || d.name.toLowerCase().includes(query))
        .sort((a, b) =>
          this.config.fileSort === "recent"
            ? (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name),
        );
      const target = drawings[this.filesScroll] ?? drawings[0];
      if (target) {
        this.openDrawing(target.path);
        return true;
      }
    }
    const ch = printable(k);
    if (ch) {
      this.setFileQuery(this.fileSearch + ch);
      return true;
    }
    if (k.name === "backspace") {
      this.setFileQuery([...this.fileSearch].slice(0, -1).join(""));
      return true;
    }
    const delta =
      k.name === "up" ? -1 : k.name === "down" ? 1 : k.name === "pageup" ? -8 : k.name === "pagedown" ? 8 : 0;
    if (delta !== 0) {
      this.scrollFiles(delta);
      return true;
    }
    return false;
  }

  private historyPanelKey(k: KeyEvent): boolean {
    if (k.name === "up" || k.name === "down" || k.name === "pageup" || k.name === "pagedown") {
      const delta = k.name === "up" ? -1 : k.name === "down" ? 1 : k.name === "pageup" ? -8 : 8;
      this.moveHistory(delta);
      return true;
    }
    return false;
  }

  private paletteKey(k: KeyEvent): void {
    if (k.name === "escape") return this.closePanel();
    const matches = filterCommands(this.paletteSearch, COMMANDS);
    if (k.name === "up" || k.name === "down" || k.name === "pageup" || k.name === "pagedown") {
      const delta = k.name === "up" ? -1 : k.name === "down" ? 1 : k.name === "pageup" ? -8 : 8;
      this.movePalette(delta);
      return;
    }
    if (k.name === "return" || k.name === "enter") {
      const command = matches[Math.min(Math.max(0, this.paletteCursor), matches.length - 1)];
      if (command) this.runCommand(command.id);
      return;
    }
    if (k.name === "backspace") {
      this.setPaletteQuery([...this.paletteSearch].slice(0, -1).join(""));
      return;
    }
    if (isCtrl(k, "u")) return this.setPaletteQuery("");
    const ch = printable(k);
    if (ch) this.setPaletteQuery(this.paletteSearch + ch);
    this.requestRender();
  }

  private dialogKey(k: KeyEvent) {    const d = this.dialog!;
    if (k.name === "escape") return this.closeDialog();
    if (k.name === "return" || k.name === "enter") return this.submitDialog();
    if (d.kind !== "input") {
      if (k.name === "y") return this.submitDialog();
      if (k.name === "n") this.closeDialog();
      return;
    }
    const chars = [...d.value];
    switch (k.name) {
      case "backspace":
        if (d.cursor > 0) chars.splice(--d.cursor, 1);
        break;
      case "delete":
        chars.splice(d.cursor, 1);
        break;
      case "left":
        d.cursor = Math.max(0, d.cursor - 1);
        break;
      case "right":
        d.cursor = Math.min(chars.length, d.cursor + 1);
        break;
      case "home":
        d.cursor = 0;
        break;
      case "end":
        d.cursor = chars.length;
        break;
      default: {
        if (isCtrl(k, "a")) d.cursor = 0;
        else if (isCtrl(k, "e")) d.cursor = chars.length;
        else if (isCtrl(k, "u")) {
          chars.splice(0, d.cursor);
          d.cursor = 0;
        } else {
          const ch = printable(k);
          if (ch) chars.splice(d.cursor++, 0, ch);
        }
      }
    }
    d.value = chars.join("");
    d.error = null;
  }

  private onPaste(e: PasteEvent) {
    const text = new TextDecoder().decode(e.bytes);
    if (this.dialog?.kind === "input") {
      const d = this.dialog;
      const insert = text.split(/\r?\n/)[0] ?? "";
      const chars = [...d.value];
      chars.splice(d.cursor, 0, ...insert);
      d.value = chars.join("");
      d.cursor += [...insert].length;
    } else if (this.editor.textEntry) {
      for (const ch of text.replace(/\r\n?/g, "\n")) {
        this.editor.key(ch === "\n" ? KEY.ENTER : ch, mods());
      }
    } else if (!this.dialog) {
      this.pasteText(text);
    }
    this.requestRender();
  }

  // ---------------------------------------------------------------- actions

  undo(): void {
    this.editor.undo();
    this.requestRender();
  }

  redo(): void {
    this.editor.redo();
    this.requestRender();
  }

  setTool(id: ToolId): void {
    if (this.readOnly) return this.toast("read-only");
    this.editor.flush();
    this.editor.setTool(id);
    this.hint = "default";
    this.chipsUntil = Date.now() + CHIP_MS;
    this.later(CHIP_MS + 10, () => this.requestRender());
    this.requestRender();
  }

  private anchorOf(id: ItemId): number {
    return layoutToolbar(this.width).items.find((i) => i.id === id)?.x ?? 1;
  }

  private togglePanel(id: PanelId, anchorX: number) {
    this.editor.flush();
    if (this.panel === id) return this.closePanel();
    if (id === "files") {
      this.drawings = this.store.list();
      this.filesScroll = 0;
    }
    if (id === "history") {
      this.historyList = this.history.list(this.drawing.name);
      this.historyCursor = 0;
    }
    if (id === "palette") {
      this.paletteSearch = "";
      this.paletteCursor = 0;
    }
    this.panel = id;
    this.panelAnchor = anchorX;
    this.requestRender();
  }

  closePanel(): void {
    this.panel = null;
    this.requestRender();
  }

  activate(id: ItemId, anchorX: number): void {
    switch (id) {
      case "quit":
        this.quit();
        break;
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      case "files":
      case "export":
      case "settings":
      case "help":
      case "menu":
        this.togglePanel(id, id === "menu" ? anchorX : this.anchorOf(id));
        break;
      default:
        this.setTool(id);
        this.panel = null;
    }
    this.requestRender();
  }

  private copySelection(cut: boolean) {
    if (this.tool !== "select") return;
    if (cut && this.readOnly) return this.toast("read-only");
    const text = this.editor.select.copySelection();
    if (!text) return;
    this.lastCopy = text;
    this.opts.clipboard.copy(text);
    if (cut) this.editor.select.eraseSelection();
    this.toast(cut ? "cut to clipboard" : "copied to clipboard");
  }

  private pasteText(text: string) {
    const size = textSize(text);
    const select = this.editor.select;
    const at =
      this.tool === "select" && select.hasSelection && select.selectBox
        ? select.selectBox.topLeft()
        : this.viewport.toCanvas(
            Math.floor((this.width - size.x) / 2),
            Math.floor((this.height - size.y) / 2),
          );
    this.editor.cancelGesture();
    this.setTool("select");
    this.editor.select.paste(text, at);
    this.toast("pasted");
  }

  // dialogs

  openDialog(d: Dialog): void {
    this.dialog = d;
    this.requestRender();
  }

  closeDialog(): void {
    this.dialog = null;
    this.requestRender();
  }

  private async submitDialog() {
    const d = this.dialog;
    if (!d) return;
    if (d.kind === "confirm") {
      this.dialog = null;
      d.confirm();
      this.requestRender();
      return;
    }
    const error = await d.submit(d.value.trim());
    if (this.dialog !== d) return;
    if (error) d.error = error;
    else this.dialog = null;
    this.requestRender();
  }

  private prompt(title: string, label: string, value: string, submit: InputDialog["submit"]) {
    this.openDialog({ kind: "input", title, label, value, cursor: [...value].length, error: null, submit });
  }

  private nameError(name: string, except?: string): string | null {
    if (!name) return "name can't be empty";
    if (slugify(name) !== (except && slugify(except)) && this.store.exists(name)) return "a drawing with that name exists";
    return null;
  }

  // files

  openDrawing(path: string): void {
    if (path === this.drawing.path) return this.closePanel();
    try {
      const { file, layer } = this.store.loadSync(path);
      this.switchTo({ path, name: file.name, layer, createdAt: file.createdAt });
    } catch (e) {
      this.toast(`can't open: ${(e as Error).message}`);
    }
  }

  private switchTo(d: OpenDrawing) {
    this.editor.cancelGesture();
    this.editor.flush();
    if (this.dirty || this.saveTimer) this.save();
    this.placing = null;
    this.connectorSource = null;
    this.drawing = d;
    this.attachCanvas(new Canvas(d.layer));
    this.config.lastDrawing = d.path;
    this.persistConfig();
    this.panel = null;
    this.recenterSoon = true;
    this.lastSnapshot = Date.now();
    this.watchDrawing(this.opts.watch === true);
    this.requestRender();
  }

  newDrawing(): void {
    if (this.readOnly) return this.toast("read-only");
    this.prompt("new drawing", "name", this.store.uniqueName(), (name) => {
      const err = this.nameError(name);
      if (err) return err;
      const path = this.store.create(name);
      this.switchTo({ path, name, layer: new Canvas().committed, createdAt: new Date().toISOString() });
      return null;
    });
  }

  renameDrawing(): void {
    if (this.readOnly) return this.toast("read-only");
    this.prompt("rename drawing", "name", this.drawing.name, (name) => {
      if (name === this.drawing.name) return null;
      const err = this.nameError(name, this.drawing.name);
      if (err) return err;
      this.editor.flush();
      const path = this.store.rename(this.drawing.path, name, this.editor.canvas.committed, this.drawing.createdAt);
      this.drawing = { ...this.drawing, path, name };
      this.dirty = false;
      this.drawings = this.store.list();
      this.config.lastDrawing = path;
      this.persistConfig();
      this.watchDrawing(this.opts.watch === true);
      return null;
    });
  }

  forkDrawing(): void {
    if (this.readOnly) return this.toast("read-only");
    this.prompt("fork drawing", "name", this.store.uniqueName(`${this.drawing.name} copy`), (name) => {
      const err = this.nameError(name);
      if (err) return err;
      this.editor.flush();
      const layer = this.editor.canvas.committed.clone();
      const path = this.store.pathFor(name);
      const createdAt = new Date().toISOString();
      this.store.save(path, name, layer, createdAt);
      this.switchTo({ path, name, layer, createdAt });
      this.toast(`forked to ${name}`);
      return null;
    });
  }

  deleteDrawing(): void {
    if (this.readOnly) return this.toast("read-only");
    this.openDialog({
      kind: "confirm",
      title: "delete drawing",
      message: `delete "${this.drawing.name}"? this can't be undone.`,
      yes: "delete",
      confirm: () => {
        // Settle pending edits first so autosave can't recreate the file.
        this.editor.cancelGesture();
        this.editor.flush();
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.dirty = false;
        this.store.delete(this.drawing.path);
        const next = this.store.list()[0];
        if (next) {
          const { file, layer } = this.store.loadSync(next.path);
          this.switchTo({ path: next.path, name: file.name, layer, createdAt: file.createdAt });
        } else {
          const name = this.store.uniqueName();
          const path = this.store.create(name);
          this.switchTo({ path, name, layer: new Canvas().committed, createdAt: new Date().toISOString() });
        }
        this.drawings = this.store.list();
        this.toast("deleted");
      },
    });
  }

  clearDrawing(): void {
    if (this.readOnly) return this.toast("read-only");
    this.editor.cancelGesture();
    this.editor.flush();
    this.editor.select.cleanup();
    this.editor.canvas.clear();
    this.panel = null;
    this.toast("cleared · ctrl+z to undo");
  }

  importText(): void {
    if (this.readOnly) return this.toast("read-only");
    this.prompt("import text", "file", "", (value) => {
      const error = this.importTextPath(resolve(value.replace(/^~(?=$|\/)/, homedir())));
      return error;
    });
  }

  private importTextPath(path: string): string | null {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return "can't read that file";
    }
    this.startPlacing(text);
    return null;
  }

  /** Native picker, with the text prompt as fallback on systems without one. */
  browseImportText(): void {
    if (this.readOnly) return this.toast("read-only");
    const path = nativeFilePicker("open", { title: "Import text as ASCII" });
    if (!path) return this.importText();
    const error = this.importTextPath(path);
    if (error) this.toast(error);
  }

  importMedia(): void {
    if (this.readOnly) return this.toast("read-only");
    this.prompt("import image/video", "file", "", (value) => {
      const error = this.importMediaPath(resolve(value.replace(/^~(?=$|\/)/, homedir())));
      return error;
    });
  }

  browseImportMedia(): void {
    if (this.readOnly) return this.toast("read-only");
    const path = nativeFilePicker("open", { title: "Import image or video as ASCII" });
    if (path) {
      const error = this.importMediaPath(path);
      if (error) this.toast(error);
    } else {
      this.importMedia();
    }
  }

  insertTablePrompt(): void {
    if (this.readOnly) return this.toast("read-only");
    this.prompt("insert table", "size (cols x rows)", "3x3", (value) => {
      const match = value.trim().match(/^(\d+)\s*[xX, ]\s*(\d+)$/);
      if (!match) return "expected format: <cols>x<rows> (e.g. 3x3)";
      const cols = parseInt(match[1]!, 10);
      const rows = parseInt(match[2]!, 10);
      if (cols < 1 || cols > 20) return "cols must be 1..20";
      if (rows < 1 || rows > 50) return "rows must be 1..50";

      const tableText = generateTable({
        cols,
        rows,
        colWidth: 10,
        lineStyle: this.config.lineStyle,
      });
      this.pasteText(tableText);
      this.toast(`table ${cols}x${rows} inserted`);
      return null;
    });
  }

  /** Decodes one image/video frame with ffmpeg and starts placing it on the canvas. */
  private importMediaPath(path: string): string | null {
    let layer: Layer;
    try {
      layer = mediaToLayer(path, { width: this.config.mediaWidth });
    } catch (e) {
      return (e as Error).message;
    }
    if (layer.size() === 0) return "nothing to import";
    this.editor.cancelGesture();
    this.editor.flush();
    this.panel = null;
    this.placing = layer;
    const size = layer.keys().reduce(
      (box, p) => ({ w: Math.max(box.w, p.x + 1), h: Math.max(box.h, p.y + 1) }),
      { w: 1, h: 1 },
    );
    const center = this.viewport.toCanvas(
      Math.max(0, Math.floor((this.width - size.w) / 2)),
      Math.max(0, Math.floor((this.height - size.h) / 2)),
    );
    this.showPlacing(center);
    this.toast(`${basename(path)} · click to place`);
    return null;
  }

  /** Imported text follows the pointer as scratch until a click commits it. */
  startPlacing(text: string): void {
    const layer = textToLayer(text);
    if (layer.size() === 0) return this.toast("nothing to import");
    this.editor.cancelGesture();
    this.editor.flush();
    this.panel = null;
    this.placing = layer;
    const size = textSize(text);
    const center = this.viewport.toCanvas(
      Math.floor((this.width - size.x) / 2),
      Math.floor((this.height - size.y) / 2),
    );
    this.showPlacing(center);
  }

  private showPlacing(at: Vector) {
    if (!this.placing) return;
    const scratch = new Canvas().committed;
    for (const [p, v] of this.placing.entries()) scratch.set(p.add(at), v);
    this.editor.canvas.setScratch(scratch);
  }

  // export

  setExport(patch: Partial<ExportConfig>): void {
    this.config.export = { ...this.config.export, ...patch };
    this.persistConfig();
    this.requestRender();
  }

  /** The layer to export: selection when requested and present, otherwise everything. */
  private exportLayer(): Layer {
    if (this.config.export.selectionOnly) {
      const selected = this.editor.select.selectionLayer();
      if (selected) return selected;
    }
    return this.editor.canvas.committed;
  }

  private renderedExport(): RenderedExport {
    return renderExport(this.exportLayer(), this.config.export);
  }

  exportPreview(): string {
    return this.renderedExport().text || "(empty drawing)";
  }

  copyExport(): void {
    this.opts.clipboard.copy(this.renderedExport().text);
    this.toast("copied to clipboard");
  }

  copyMarkdown(): void {
    const cfg = { ...this.config.export, format: "txt" as const, wrapper: "none" as const, fenced: false };
    const text = exportText(this.exportLayer(), cfg);
    this.opts.clipboard.copy(`\`\`\`text\n${text}\n\`\`\``);
    this.toast("copied as markdown");
  }

  saveExport(): void {
    const rendered = this.renderedExport();
    const defaultName = defaultExportName(this.drawing.name, rendered.extension);
    this.prompt("save export", "file", defaultName, (value) => {
      const path = resolve(value.replace(/^~(?=$|\/)/, homedir()));
      try {
        if (rendered.bytes) {
          writeFileSync(path, Buffer.from(rendered.bytes));
        } else {
          writeFileSync(path, rendered.text.endsWith("\n") ? rendered.text : `${rendered.text}\n`);
        }
      } catch (e) {
        return `can't write: ${(e as Error).message}`;
      }
      this.toast(`saved ${path}`);
      return null;
    });
  }

  saveExportPicker(): void {
    const rendered = this.renderedExport();
    const path = nativeFilePicker("save", {
      title: "Save export",
      defaultName: defaultExportName(this.drawing.name, rendered.extension),
    });
    if (!path) return this.saveExport();
    try {
      if (rendered.bytes) {
        writeFileSync(path, Buffer.from(rendered.bytes));
      } else {
        writeFileSync(path, rendered.text.endsWith("\n") ? rendered.text : `${rendered.text}\n`);
      }
      this.toast(`saved ${path}`);
    } catch (e) {
      this.toast(`can't write: ${(e as Error).message}`);
    }
  }

  scrollFiles(delta: number): void {
    this.filesScroll = Math.max(0, this.filesScroll + delta);
    this.requestRender();
  }

  setFileQuery(query: string): void {
    this.fileSearch = query;
    this.filesScroll = 0;
    this.requestRender();
  }

  toggleFileSort(): void {
    this.updateConfig({ fileSort: this.config.fileSort === "recent" ? "name" : "recent" });
  }

  private duplicateSelection(): void {
    if (this.readOnly) return this.toast("read-only");
    if (!this.editor.select.duplicate()) return this.toast("nothing selected");
    this.toast("duplicated");
  }

  setBrushSize(size: number): void {
    this.config.brushSize = Math.max(1, Math.min(9, Math.round(size)));
    this.editor.brushSize = this.config.brushSize;
    this.persistConfig();
    this.toast(`brush ${this.config.brushSize}`);
    this.requestRender();
  }

  cycleBoxShape(delta = 1): void {
    const shapes = BOX_SHAPES;
    const idx = shapes.indexOf(this.config.boxShape);
    const nextIdx = ((idx + delta) % shapes.length + shapes.length) % shapes.length;
    const next = shapes[nextIdx]!;
    this.updateConfig({ boxShape: next });
    if (this.editor.canvas.selection != null) {
      this.editor.select.restyle({ box: next });
    }
    this.toast(`box: ${next}`);
  }

  cycleLineStyle(delta = 1): void {
    const styles = LINE_STYLES;
    const idx = styles.indexOf(this.config.lineStyle);
    const nextIdx = ((idx + delta) % styles.length + styles.length) % styles.length;
    const next = styles[nextIdx]!;
    this.updateConfig({ lineStyle: next });
    if (this.editor.canvas.selection != null) {
      this.editor.select.restyle({ line: next });
    }
    this.toast(`line: ${next}`);
  }

  cycleFontStyle(delta = 1): void {
    const fonts = TEXT_FONT_STYLES;
    const idx = fonts.indexOf(this.config.fontStyle);
    const nextIdx = ((idx + delta) % fonts.length + fonts.length) % fonts.length;
    const next = fonts[nextIdx]!;
    this.updateConfig({ fontStyle: next });
    this.toast(`font: ${next}`);
  }

  // history

  openHistory(): void {
    this.historyList = this.history.list(this.drawing.name);
    this.historyCursor = 0;
    this.togglePanel("history", this.anchorOf("settings"));
  }

  moveHistory(delta: number): void {
    this.historyCursor = Math.max(0, Math.min(Math.max(0, this.historyList.length - 1), this.historyCursor + delta));
    this.requestRender();
  }

  restoreHistory(id: string): void {
    if (this.readOnly) return this.toast("read-only");
    const layer = this.history.load(id, this.drawing.name);
    if (!layer) return this.toast("couldn't load that snapshot");
    this.editor.cancelGesture();
    this.editor.flush();
    this.editor.canvas.replace(layer);
    this.closePanel();
    this.toast("snapshot restored · ctrl+z to undo");
  }

  // settings

  updateConfig(patch: Partial<Config>): void {
    Object.assign(this.config, patch);
    this.applyRuntimeConfig();
    this.persistConfig();
    if (patch.theme !== undefined) this.applyTheme();
    if (patch.showPath !== undefined) this.requestRender();
    this.requestRender();
  }

  setSettingsPage(page: number): void {
    this.settingsPageIndex = ((page % 3) + 3) % 3;
    this.requestRender();
  }

  copyPath(): void {
    this.opts.clipboard.copy(this.drawing.path);
    this.toast(`path copied: ${this.drawing.path}`);
  }

  showPaths(): void {
    this.openDialog({
      kind: "confirm",
      title: "where files live",
      message: `drawings: ${this.store.dir}\nconfig:   ${this.opts.configPath ?? "default"}\nhistory:  ${this.history.dir}`,
      yes: "ok",
      confirm: () => {},
    });
  }

  // command palette

  setPaletteQuery(query: string): void {
    this.paletteSearch = query;
    this.paletteCursor = 0;
    this.requestRender();
  }

  movePalette(delta: number): void {
    const count = filterCommands(this.paletteSearch, COMMANDS).length;
    if (count === 0) return;
    this.paletteCursor = ((this.paletteCursor + delta) % count + count) % count;
    this.requestRender();
  }

  /** Runs a command by id; shared by the palette, key bindings and menus. */
  runCommand(id: string): void {
    if (this.readOnly && /^app:(new|rename|fork|delete|clear|import|paste|cut|duplicate|undo|redo|undoAll|align|distribute)/.test(id)) {
      return this.toast("read-only");
    }
    if (id === "tool:cycleBoxShape") return this.cycleBoxShape();
    if (id === "tool:cycleLineStyle") return this.cycleLineStyle();
    if (id === "tool:cycleFontStyle") return this.cycleFontStyle();
    if (id === "tool:brushIncrease") return this.setBrushSize(this.config.brushSize + 1);
    if (id === "tool:brushDecrease") return this.setBrushSize(this.config.brushSize - 1);
    if (id.startsWith("tool:")) return this.setTool(id.slice(5) as ToolId);
    if (this.panel === "palette") this.closePanel();

    switch (id) {
      case "app:undo":
        return this.undo();
      case "app:redo":
        return this.redo();
      case "app:save":
        this.editor.flush();
        this.save();
        return this.toast(`saved · ${this.drawing.path}`);
      case "app:new":
        return this.newDrawing();
      case "app:files":
        return this.togglePanel("files", this.anchorOf("files"));
      case "app:quickSwitch":
        this.setFileQuery("");
        return this.togglePanel("files", this.anchorOf("files"));
      case "app:rename":
        return this.renameDrawing();
      case "app:fork":
        return this.forkDrawing();
      case "app:delete":
        return this.deleteDrawing();
      case "app:clear":
        return this.clearDrawing();
      case "app:history":
        return this.openHistory();
      case "app:importText":
        return this.browseImportText();
      case "app:importMedia":
        return this.browseImportMedia();
      case "app:export":
        return this.togglePanel("export", this.anchorOf("export"));
      case "app:copyExport":
        return this.copyExport();
      case "app:copyMarkdown":
        return this.copyMarkdown();
      case "app:saveExport":
        return this.saveExportPicker();
      case "app:copy":
        return this.copySelection(false);
      case "app:cut":
        return this.copySelection(true);
      case "app:paste": {
        const text = this.opts.clipboard.paste();
        if (text) this.pasteText(text);
        return;
      }
      case "app:insertTable":
        return this.insertTablePrompt();
      case "app:selectAll":
        this.setTool("select");
        this.editor.select.selectAll();
        return this.toast("selected all");
      case "app:duplicate":
        return this.duplicateSelection();
      case "app:settings":
        return this.togglePanel("settings", this.anchorOf("settings"));
      case "app:help":
        return this.togglePanel("help", this.anchorOf("help"));
      case "app:palette":
        return this.togglePanel("palette", Math.floor(this.width / 2) - 30);
      case "app:recenter":
        return this.recenter();
      case "app:copyPath":
        return this.copyPath();
      case "app:quit":
        return this.armQuit();
      case "app:undoAll": {
        const latest = this.history.list(this.drawing.name)[0];
        if (latest) this.restoreHistory(latest.id);
        else this.toast("no snapshots");
        return;
      }
      case "app:alignLeft":
      case "app:alignCenter":
      case "app:alignRight":
      case "app:alignTop":
      case "app:alignMiddle":
      case "app:alignBottom": {
        const mode = id.slice("app:align".length).toLowerCase() as "left" | "center" | "right" | "top" | "middle" | "bottom";
        if (!this.editor.select.align(mode)) this.toast("select two or more boxes first");
        return;
      }
      case "app:distributeH":
      case "app:distributeV":
        if (!this.editor.select.distribute(id.endsWith("H") ? "horizontal" : "vertical")) {
          this.toast("select three or more boxes first");
        }
        return;
    }
    this.requestRender();
  }

  setGrid(g: GridStyle): void {
    this.config.grid = g;
    this.persistConfig();
    this.requestRender();
  }

  setCopyOnSelect(on: boolean): void {
    this.config.copyOnSelect = on;
    this.persistConfig();
    this.requestRender();
  }

  setTheme(t: ThemeChoice): void {
    this.config.theme = t;
    this.persistConfig();
    this.applyTheme();
  }

  recenter(): void {
    this.recenterSoon = true;
    this.requestRender();
  }
}
