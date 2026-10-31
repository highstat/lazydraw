// Command registry and configurable key bindings.
// Bindings use a small language: `primary+z`, `primary+shift+z`, `ctrl+y`, `alt+up`,
// `home`, `?`. `primary` is Cmd on macOS (Ctrl also accepted) and Ctrl elsewhere.
import type { KeyEvent } from "@opentui/core";

export interface CommandDef {
  id: string;
  label: string;
  group: string;
  /** Default binding(s). Several alternatives may be separated by commas. */
  binding?: string;
}

export const COMMANDS: readonly CommandDef[] = [
  { id: "app:undo", label: "Undo", group: "Edit", binding: "primary+z,ctrl+z,cmd+z,u" },
  { id: "app:redo", label: "Redo", group: "Edit", binding: "primary+shift+z,cmd+shift+z,ctrl+shift+z,primary+y,ctrl+y,ctrl+r" },
  { id: "app:save", label: "Save now", group: "File", binding: "primary+s" },
  { id: "app:saveAs", label: "Save drawing as…", group: "File", binding: "primary+shift+s" },
  { id: "app:new", label: "New drawing", group: "File", binding: "primary+n" },
  { id: "app:files", label: "Open drawing / file browser", group: "File", binding: "primary+o" },
  { id: "app:quickSwitch", label: "Quick switch drawing", group: "File", binding: "primary+p" },
  { id: "app:rename", label: "Rename drawing", group: "File", binding: "f2" },
  { id: "app:fork", label: "Fork drawing", group: "File", binding: "primary+alt+s" },
  { id: "app:delete", label: "Delete drawing", group: "File" },
  { id: "app:clear", label: "Clear canvas", group: "Edit" },
  { id: "app:history", label: "Version history", group: "File", binding: "primary+h" },
  { id: "app:importText", label: "Import text file…", group: "File", binding: "primary+i" },
  { id: "app:importMedia", label: "Import image / video…", group: "File", binding: "primary+shift+i" },
  { id: "app:insertTable", label: "Insert ASCII table…", group: "Edit", binding: "primary+t" },
  { id: "app:export", label: "Export panel", group: "File", binding: "primary+e" },
  { id: "app:copyExport", label: "Copy export", group: "Export" },
  { id: "app:copyMarkdown", label: "Copy as Markdown fence", group: "Export" },
  { id: "app:saveExport", label: "Save export to file…", group: "Export" },
  { id: "app:copy", label: "Copy selection", group: "Edit", binding: "primary+c" },
  { id: "app:cut", label: "Cut selection", group: "Edit", binding: "primary+x" },
  { id: "app:paste", label: "Paste", group: "Edit", binding: "primary+v" },
  { id: "app:selectAll", label: "Select all", group: "Edit", binding: "primary+a" },
  { id: "app:deleteSelection", label: "Delete selection", group: "Edit", binding: "delete,backspace" },
  { id: "app:duplicate", label: "Duplicate selection", group: "Edit", binding: "primary+d" },
  { id: "app:settings", label: "Settings", group: "View", binding: "primary+," },
  { id: "view:toggleMiniBar", label: "Toggle floating mini-bar", group: "View" },
  { id: "app:help", label: "Keyboard help", group: "View", binding: "?" },
  { id: "app:palette", label: "Command palette", group: "View", binding: "primary+k" },
  { id: "app:recenter", label: "Recenter drawing", group: "View", binding: "home" },
  { id: "app:copyPath", label: "Copy drawing path", group: "View" },
  { id: "app:quit", label: "Quit", group: "App", binding: "primary+q" },
  { id: "app:undoAll", label: "Undo all (restore last snapshot)", group: "Edit" },
  { id: "app:alignLeft", label: "Align left", group: "Arrange" },
  { id: "app:alignCenter", label: "Align center", group: "Arrange" },
  { id: "app:alignRight", label: "Align right", group: "Arrange" },
  { id: "app:alignTop", label: "Align top", group: "Arrange" },
  { id: "app:alignMiddle", label: "Align middle", group: "Arrange" },
  { id: "app:alignBottom", label: "Align bottom", group: "Arrange" },
  { id: "app:distributeH", label: "Distribute horizontally", group: "Arrange" },
  { id: "app:distributeV", label: "Distribute vertically", group: "Arrange" },
  { id: "tool:box", label: "Box tool", group: "Tools" },
  { id: "tool:select", label: "Select tool", group: "Tools" },
  { id: "tool:arrow", label: "Arrow tool", group: "Tools" },
  { id: "tool:line", label: "Line tool", group: "Tools" },
  { id: "tool:text", label: "Text tool", group: "Tools" },
  { id: "tool:eraser", label: "Eraser tool", group: "Tools" },
  { id: "tool:pencil", label: "Pencil tool", group: "Tools" },
  { id: "tool:cycleBoxShape", label: "Cycle box shape", group: "Tools", binding: "b" },
  { id: "tool:cycleLineStyle", label: "Cycle line / border style", group: "Tools", binding: "s" },
  { id: "tool:cycleFontStyle", label: "Cycle text font style", group: "Tools", binding: "primary+alt+f" },
  { id: "tool:brushIncrease", label: "Increase brush size", group: "Tools", binding: "],+,=" },
  { id: "tool:brushDecrease", label: "Decrease brush size", group: "Tools", binding: "[,-" },
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/** Commands matching a fuzzy-ish substring query (label/group/id). */
export function filterCommands(query: string, commands: readonly CommandDef[] = COMMANDS): CommandDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];
  const words = q.split(/\s+/);
  return commands.filter((c) => {
    const haystack = `${c.label} ${c.group} ${c.id}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export function defaultBinding(id: string): string | undefined {
  return COMMAND_BY_ID.get(id)?.binding;
}

interface ParsedBinding {
  key: string;
  primary: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

function parse(spec: string): ParsedBinding | null {
  const parts = spec
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts.pop()!;
  const out: ParsedBinding = { key, primary: false, ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts) {
    if (part === "primary" || part === "cmdorctrl") out.primary = true;
    else if (part === "ctrl" || part === "control") out.ctrl = true;
    else if (part === "cmd" || part === "meta" || part === "super") out.meta = true;
    else if (part === "alt" || part === "option" || part === "opt") out.alt = true;
    else if (part === "shift") out.shift = true;
    else return null;
  }
  return out;
}

const IS_MAC = process.platform === "darwin";
const keyName = (k: KeyEvent) => (k.name || k.sequence || "").toLowerCase();

/** Does this key event match one binding alternative? */
export function matchesBinding(k: KeyEvent, spec: string): boolean {
  const binding = parse(spec);
  if (!binding) return false;
  if (keyName(k) !== binding.key) return false;
  if (binding.shift !== k.shift && binding.key.length > 1) return false;
  if (binding.shift && !k.shift) return false;
  if (binding.alt !== !!k.option) return false;

  const primaryOn = binding.primary
    ? IS_MAC
      ? !!k.meta || !!k.super || k.ctrl
      : k.ctrl
    : false;
  const ctrlOn = binding.ctrl ? k.ctrl : false;
  const metaOn = binding.meta ? !!k.meta || !!k.super : false;
  if (binding.primary || binding.ctrl || binding.meta) {
    if (!primaryOn && !ctrlOn && !metaOn) return false;
    // Reject unrelated modifiers when the binding is explicit about them.
    if (!binding.primary && !binding.ctrl && k.ctrl) return false;
    if (!binding.primary && !binding.meta && (k.meta || k.super)) return false;
  } else if (k.ctrl || k.meta || k.super) {
    return false;
  }
  if (binding.key.length === 1 && binding.shift !== k.shift && /[a-z0-9]/.test(binding.key)) return false;
  return true;
}

/**
 * Splits a binding spec into its alternatives. A comma directly after `+` is the comma
 * key itself (`primary+,`), not a separator, so `primary+,` stays one alternative.
 */
export function bindingAlternatives(spec: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i]!;
    if (ch === "," && spec[i - 1] !== "+") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

/** The first alternative, for compact display in the palette. */
export function primaryBinding(spec: string): string {
  return bindingAlternatives(spec)[0] ?? "";
}

/** Matches a command against its default binding or a user override. */
export function commandMatches(k: KeyEvent, id: string, keymap: Record<string, string> = {}): boolean {
  const spec = keymap[id] ?? defaultBinding(id);
  if (!spec || spec.toLowerCase() === "none") return false;
  return bindingAlternatives(spec).some((part) => matchesBinding(k, part));
}
