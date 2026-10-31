// What popovers and dialogs need from the app.
import type { Editor } from "../core/editor";
import type { ExportConfig } from "../core/export";
import type { Config, FileSort, GridStyle, ThemeChoice } from "../storage/config";
import type { DrawingInfo } from "../storage/drawings";
import type { Snapshot } from "../storage/history";
import type { CommandDef } from "./commands";
import type { ItemId, PanelId } from "./toolbar";

export interface InputDialog {
  kind: "input";
  title: string;
  label: string;
  value: string;
  cursor: number;
  error: string | null;
  /** Returns an error message to keep the dialog open, or null to close it. */
  submit(value: string): string | null | Promise<string | null>;
}

export interface ConfirmDialog {
  kind: "confirm";
  title: string;
  message: string;
  yes: string;
  confirm(): void;
}

export type Dialog = InputDialog | ConfirmDialog;

export interface Host {
  readonly editor: Editor;
  readonly config: Config;
  readonly drawingName: string;
  readonly drawings: DrawingInfo[];
  readonly currentPath: string;
  readonly drawingsDir: string;
  readonly readOnly: boolean;
  panel: PanelId | null;

  // files
  readonly filesScroll: number;
  readonly fileQuery: string;
  readonly fileSort: FileSort;
  openDrawing(path: string): void;
  newDrawing(): void;
  renameDrawing(): void;
  forkDrawing(): void;
  deleteDrawing(): void;
  clearDrawing(): void;
  importText(): void;
  browseImportText(): void;
  importMedia(): void;
  browseImportMedia(): void;
  scrollFiles(delta: number): void;
  setFileQuery(query: string): void;
  toggleFileSort(): void;

  // history
  readonly historyEntries: Snapshot[];
  readonly historyIndex: number;
  openHistory(): void;
  moveHistory(delta: number): void;
  restoreHistory(id: string): void;

  // export
  setExport(patch: Partial<ExportConfig>): void;
  exportPreview(): string;
  copyExport(): void;
  copyMarkdown(): void;
  saveExport(): void;
  saveExportPicker(): void;

  // settings
  updateConfig(patch: Partial<Config>): void;
  setGrid(g: GridStyle): void;
  setTheme(t: ThemeChoice): void;
  setCopyOnSelect(on: boolean): void;
  setBrushSize(size: number): void;
  setSettingsPage(page: number): void;
  readonly settingsPage: number;
  recenter(): void;
  copyPath(): void;
  showPaths(): void;

  // palette
  readonly commands: readonly CommandDef[];
  readonly paletteQuery: string;
  readonly paletteIndex: number;
  setPaletteQuery(query: string): void;
  movePalette(delta: number): void;
  runCommand(id: string): void;

  closePanel(): void;
  activate(id: ItemId, anchorX: number): void;
  openDialog(d: Dialog): void;
  closeDialog(): void;
  toast(message: string): void;
  requestRender(): void;
}
