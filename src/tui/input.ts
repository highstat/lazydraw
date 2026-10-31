// Terminal key events -> tool key names (§6).
import type { KeyEvent } from "@opentui/core";
import { KEY } from "../core/tools/tool";
import { isPlaceable } from "../core/text";

const NAMED: Record<string, string> = {
  return: KEY.ENTER,
  enter: KEY.ENTER,
  linefeed: KEY.ENTER,
  backspace: KEY.BACKSPACE,
  delete: KEY.DELETE,
  up: KEY.UP,
  down: KEY.DOWN,
  left: KEY.LEFT,
  right: KEY.RIGHT,
  home: KEY.HOME,
  end: KEY.END,
  pageup: KEY.PAGE_UP,
  pagedown: KEY.PAGE_DOWN,
};

/** The printable character a key produces, if any. */
export function printable(k: KeyEvent): string | null {
  if (k.ctrl || k.meta || k.super) return null;
  if (k.name === "space") return " ";
  if (k.sequence && isPlaceable(k.sequence)) return k.sequence;
  // Kitty-protocol events may carry an escape sequence; fall back to the name.
  if ([...k.name].length === 1) {
    const ch = k.shift ? k.name.toUpperCase() : k.name;
    if (isPlaceable(ch)) return ch;
  }
  return null;
}

/** Tool key for a terminal key: a printable character or an ASCIIFlow key name. */
export function toolKey(k: KeyEvent): string | null {
  return NAMED[k.name] ?? printable(k);
}

/** Alt+1..6 arrives as ESC+digit (meta) or as option on macOS with kitty keys. */
export function altDigit(k: KeyEvent): number | null {
  if (!(k.meta || k.option) || k.ctrl) return null;
  const n = Number(k.name);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

export const isCtrl = (k: KeyEvent, name: string) => k.ctrl && !k.meta && k.name === name;

const KITTY_CSI_U = /^\x1b\[(\d+)(?:;(\d+))?(?::(\d+))?u$/;
const MODIFY_OTHER_KEYS = /^\x1b\[27;(\d+);(\d+)~$/;

function codepointToKeyName(cp: number): string {
  if (cp === 13) return "return";
  if (cp === 27) return "escape";
  if (cp === 9) return "tab";
  if (cp === 32) return "space";
  if (cp === 127 || cp === 8) return "backspace";
  if (cp === 57376) return "delete";
  if (cp === 57377) return "pageup";
  if (cp === 57378) return "pagedown";
  if (cp === 57379) return "home";
  if (cp === 57380) return "end";
  if (cp === 57381) return "insert";
  if (cp >= 65 && cp <= 90) return String.fromCharCode(cp + 32); // lowercase
  if (cp >= 97 && cp <= 122) return String.fromCharCode(cp);
  if (cp >= 48 && cp <= 57) return String.fromCharCode(cp);
  return String.fromCodePoint(cp);
}

const IS_MAC = process.platform === "darwin";

/**
 * Normalizes terminal key events. When Kitty keyboard protocol or modifyOtherKeys sends
 * CSI sequences (e.g. \x1b[122;9u for Cmd+Z), ensures `name` and modifiers (super, meta, ctrl, shift)
 * are populated accurately on macOS and Linux.
 */
export function normalizeKeyEvent(k: KeyEvent): KeyEvent {
  const seq = k.sequence || k.raw || "";

  const kittyMatch = seq.match(KITTY_CSI_U);
  if (kittyMatch) {
    const cp = parseInt(kittyMatch[1]!, 10);
    const modNum = kittyMatch[2] ? parseInt(kittyMatch[2], 10) : 1;
    const mask = Math.max(0, modNum - 1);
    const shift = !!(mask & 1);
    const alt = !!(mask & 2);
    const ctrl = !!(mask & 4);
    const sup = !!(mask & 8);
    const hyper = !!(mask & 16);
    const meta = !!(mask & 32) || (IS_MAC && sup);

    k.name = codepointToKeyName(cp);
    k.shift = shift;
    k.option = alt;
    k.ctrl = ctrl;
    k.super = sup;
    k.meta = meta;
    (k as any).hyper = hyper;
    return k;
  }

  const mokMatch = seq.match(MODIFY_OTHER_KEYS);
  if (mokMatch) {
    const mask = Math.max(0, parseInt(mokMatch[1]!, 10) - 1);
    const cp = parseInt(mokMatch[2]!, 10);
    const shift = !!(mask & 1);
    const alt = !!(mask & 2);
    const ctrl = !!(mask & 4);
    const sup = !!(mask & 8);
    const meta = !!(mask & 32) || (IS_MAC && sup);

    k.name = codepointToKeyName(cp);
    k.shift = shift;
    k.option = alt;
    k.ctrl = ctrl;
    k.super = sup;
    k.meta = meta;
    return k;
  }

  if (IS_MAC && (k.super || (k as any).hyper)) {
    k.super = true;
    k.meta = true;
  }

  return k;
}
