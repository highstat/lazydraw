#!/usr/bin/env bun
// lazydraw — terminal ASCII diagram editor.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type CliRenderer, createCliRenderer } from "@opentui/core";
import pkg from "../package.json";
import { type ExportConfig, FONT_FAMILIES, isExportFormat, isFontFamily, isWrapper, renderExport, type Wrapper } from "./core/export";
import { Layer } from "./core/layer";
import { isMediaPath, mediaToLayer, MEDIA_EXTENSIONS } from "./core/media";
import { textToLayer } from "./core/text";
import { configPath, loadConfig, saveConfig } from "./storage/config";
import { DrawingStore, FILE_EXT } from "./storage/drawings";
import { App, type Clipboard, type OpenDrawing } from "./tui/app";
import { detectTerminalColorsSoon, PALETTE_WAIT_MS } from "./tui/theme";

const HELP = `lazydraw ${pkg.version} — terminal ASCII diagram editor

usage:
  lazydraw                         open the last drawing (or "untitled")
  lazydraw <name|path>             open or create a drawing
  lazydraw view <name|path>        open read-only (presentation mode)
  lazydraw <name> --watch          reload when the file changes
  lazydraw --import diagram.txt    new drawing from a text file
  lazydraw media <image|video> [name] [--width 80] [--at 1.5] [--invert]
                               new drawing from a photo or video frame (needs ffmpeg)
  lazydraw export <name|path> [--basic] [--comment <style>] [--fenced]
                               [--format txt|svg|png|html] [--font <family>] [--font-size <n>]
                               [-o out.txt]
  lazydraw list                    list saved drawings
  lazydraw paths                   show where drawings and config live
  lazydraw --version | --help

comment styles: none standard filled quotes hashes slashes three-slashes
                dashes apostrophes backticks four-spaces semicolons

drawings live in ${new DrawingStore().dir}`;

const COMMENT_ALIASES: Record<string, Wrapper> = {
  standard: "star",
  filled: "star-filled",
  quotes: "triple-quotes",
  hashes: "hash",
  slashes: "slash",
  dashes: "dash",
  apostrophes: "apostrophe",
  semicolons: "semicolon",
};

function fail(message: string): never {
  console.error(`lazydraw: ${message}`);
  process.exit(1);
}

const isPathLike = (arg: string) => arg.includes("/") || arg.endsWith(FILE_EXT) || arg.endsWith(".json");

/** Resolves a CLI argument to a drawing file path, if one exists. */
function findDrawing(store: DrawingStore, arg: string): string | null {
  if (isPathLike(arg)) {
    const path = resolve(arg);
    return existsSync(path) ? path : null;
  }
  const path = store.pathFor(arg);
  return existsSync(path) ? path : null;
}

function openOrCreate(store: DrawingStore, arg: string): OpenDrawing {
  const existing = findDrawing(store, arg);
  if (existing) {
    const { file, layer } = store.loadSync(existing);
    return { path: existing, name: file.name, layer, createdAt: file.createdAt };
  }
  const path = isPathLike(arg) ? resolve(arg) : store.pathFor(arg);
  const name = isPathLike(arg) ? basename(arg).replace(FILE_EXT, "").replace(/\.json$/, "") : arg;
  const createdAt = new Date().toISOString();
  store.save(path, name, new Layer(), createdAt);
  return { path, name, layer: new Layer(), createdAt };
}

function exportCommand(store: DrawingStore, args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      basic: { type: "boolean" },
      comment: { type: "string" },
      fenced: { type: "boolean" },
      output: { type: "string", short: "o" },
      format: { type: "string" },
      svg: { type: "boolean" },
      png: { type: "boolean" },
      html: { type: "boolean" },
      font: { type: "string" },
      "font-size": { type: "string" },
    },
  });
  const target = positionals[0];
  if (!target) fail("export needs a drawing name or path");
  const path = findDrawing(store, target);
  if (!path) fail(`no drawing named "${target}"`);
  const comment = values.comment ?? "none";
  const wrapper = COMMENT_ALIASES[comment] ?? comment;
  if (!isWrapper(wrapper)) fail(`unknown comment style "${comment}"`);
  const format = values.png ? "png" : values.svg ? "svg" : values.html ? "html" : (values.format ?? "txt");
  if (!isExportFormat(format)) fail(`unknown export format "${format}"`);
  if (values.font && !isFontFamily(values.font)) fail(`unknown font "${values.font}" (try: ${FONT_FAMILIES.join(", ")})`);
  const fontSize = values["font-size"] ? Number(values["font-size"]) : undefined;
  if (fontSize !== undefined && (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 48)) fail("font size must be 8..48");
  const base = loadConfig().export;
  const config: ExportConfig = {
    ...base,
    characters: values.basic ? "basic" : "extended",
    wrapper,
    fenced: !!values.fenced,
    format,
    fontFamily: values.font && isFontFamily(values.font) ? values.font : base.fontFamily,
    fontSize: fontSize ?? base.fontSize,
  };
  const rendered = renderExport(store.loadSync(path).layer, config);
  if (rendered.bytes) {
    if (values.output) writeFileSync(values.output, rendered.bytes);
    else process.stdout.write(rendered.bytes);
  } else {
    const text = rendered.text;
    const output = text.endsWith("\n") ? text : `${text}\n`;
    if (values.output) writeFileSync(values.output, output);
    else process.stdout.write(output);
  }
}

function systemClipboard(renderer: CliRenderer): Clipboard {
  let internal: string | null = null;
  const local = !process.env.SSH_TTY && !process.env.SSH_CONNECTION;
  const tryRun = (cmd: string[], input?: string): string | null => {
    if (!Bun.which(cmd[0]!)) return null;
    try {
      const r = Bun.spawnSync(cmd, { stdin: input === undefined ? "ignore" : new TextEncoder().encode(input) });
      return r.exitCode === 0 ? r.stdout.toString() : null;
    } catch {
      return null;
    }
  };
  const copyCommands = (): string[][] => {
    if (process.platform === "darwin") return [["pbcopy"]];
    if (process.platform === "win32") return [["clip.exe"], ["clip"]];
    return [
      ["wl-copy"],
      ["xclip", "-selection", "clipboard"],
      ["xsel", "--clipboard", "--input"],
    ];
  };
  const pasteCommands = (): string[][] => {
    if (process.platform === "darwin") return [["pbpaste"]];
    if (process.platform === "win32") {
      return [
        ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
        ["pwsh", "-NoProfile", "-Command", "Get-Clipboard"],
      ];
    }
    return [
      ["wl-paste", "--no-newline"],
      ["xclip", "-selection", "clipboard", "-o"],
      ["xsel", "--clipboard", "--output"],
    ];
  };
  return {
    copy(text) {
      internal = text;
      renderer.copyToClipboardOSC52(text);
      if (local) {
        for (const cmd of copyCommands()) if (tryRun(cmd, text) !== null) return;
      }
    },
    paste() {
      if (local) {
        for (const cmd of pasteCommands()) {
          const text = tryRun(cmd);
          if (text !== null) return text;
        }
      }
      return internal;
    },
  };
}

function mediaCommand(store: DrawingStore, args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      width: { type: "string" },
      at: { type: "string" },
      invert: { type: "boolean" },
    },
  });
  const source = positionals[0];
  if (!source) fail(`media needs an image or video path (${MEDIA_EXTENSIONS.slice(0, 6).join(", ")}, …)`);
  if (!existsSync(source)) fail(`can't find ${source}`);
  if (!isMediaPath(source)) fail(`not an image or video: ${source}`);
  const width = values.width ? Number(values.width) : 80;
  if (!Number.isFinite(width) || width < 8 || width > 240) fail("width must be 8..240");
  const at = values.at ? Number(values.at) : undefined;
  if (at !== undefined && (!Number.isFinite(at) || at < 0)) fail("at must be a positive number of seconds");
  let layer: Layer;
  try {
    layer = mediaToLayer(source, { width, at, invert: !!values.invert });
  } catch (e) {
    fail((e as Error).message);
  }
  const fallback = basename(source).replace(/\.[^.]+$/, "");
  const name = store.uniqueName(positionals[1] ?? fallback);
  const path = store.pathFor(name);
  const createdAt = new Date().toISOString();
  store.save(path, name, layer, createdAt);
  console.log(`${name}\t${layer.size()} cells\t${path}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const store = new DrawingStore();

  if (argv[0] === "export") return exportCommand(store, argv.slice(1));
  if (argv[0] === "media") return mediaCommand(store, argv.slice(1));
  if (argv[0] === "list") {
    for (const d of store.list()) console.log(`${d.name}\t${d.size} cells\t${d.path}`);
    return;
  }
  if (argv[0] === "paths") {
    console.log(`drawings\t${store.dir}`);
    console.log(`config\t${configPath()}`);
    return;
  }

  // `view` is a subcommand alias for --view/--read-only.
  const viewMode = argv[0] === "view";
  const args = viewMode ? argv.slice(1) : argv;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      import: { type: "string" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
      view: { type: "boolean" },
      "read-only": { type: "boolean" },
      watch: { type: "boolean" },
    },
  });
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(pkg.version);
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail("needs an interactive terminal (try `lazydraw export`)");

  const config = loadConfig();
  const readOnly = viewMode || !!values.view || !!values["read-only"];
  let drawing: OpenDrawing;
  if (values.import) {
    if (readOnly) fail("can't import into a read-only view");
    let text: string;
    try {
      text = readFileSync(values.import, "utf8");
    } catch {
      fail(`can't read ${values.import}`);
    }
    const name = store.uniqueName(positionals[0] ?? basename(values.import).replace(/\.[^.]+$/, ""));
    const layer = textToLayer(text);
    const path = store.pathFor(name);
    const createdAt = new Date().toISOString();
    store.save(path, name, layer, createdAt);
    drawing = { path, name, layer, createdAt };
  } else if (positionals[0]) {
    if (readOnly && !findDrawing(store, positionals[0])) fail(`no drawing named "${positionals[0]}"`);
    drawing = openOrCreate(store, positionals[0]);
  } else if (config.lastDrawing && existsSync(config.lastDrawing)) {
    drawing = openOrCreate(store, config.lastDrawing);
  } else {
    drawing = openOrCreate(store, store.list()[0]?.name ?? "untitled");
  }
  config.lastDrawing = drawing.path;
  saveConfig(config);

  const renderer = await createCliRenderer({
    useMouse: true,
    enableMouseMovement: true,
    autoFocus: true,
    screenMode: "alternate-screen",
    exitOnCtrlC: false,
    exitSignals: [],
    useKittyKeyboard: {},
  });

  // The `terminal` theme inherits the terminal's own colors, so ask for them before the first
  // frame; painting first and repainting on the answer shows a flash of the stand-in scheme. A
  // terminal too slow to answer in time still gets its colors from the app, a frame or two later.
  const term = config.theme === "terminal" ? await detectTerminalColorsSoon(renderer, PALETTE_WAIT_MS) : null;

  // Request Kitty keyboard protocol enhancement (push mode 1: disambiguate modifiers)
  // so terminals supporting Kitty keyboard protocol report Super/Cmd and Shift combinations.
  process.stdout.write("\x1b[>1u");

  let app: App | null = null;
  let exiting = false;
  const exit = (code: number, error?: unknown) => {
    if (exiting) return;
    exiting = true;
    try {
      app?.shutdown();
    } catch {
      // Still restore the terminal below.
    }
    try {
      process.stdout.write("\x1b[<u");
    } catch {}
    renderer.destroy();
    if (error) console.error(error);
    process.exit(code);
  };
  process.on("uncaughtException", (e) => exit(1, e));
  process.on("unhandledRejection", (e) => exit(1, e));
  for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"] as const) process.on(sig, () => exit(0));

  app = new App({
    renderer,
    store,
    config,
    drawing,
    clipboard: systemClipboard(renderer),
    term,
    readOnly,
    watch: !!values.watch,
    onQuit: () => exit(0),
  });
  app.requestRender();
}

await main();
