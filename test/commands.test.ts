import { describe, expect, test } from "bun:test";
import type { KeyEvent } from "@opentui/core";
import { commandMatches } from "../src/tui/commands";

const key = (partial: Partial<KeyEvent> & { name: string }): KeyEvent =>
  ({
    sequence: "",
    raw: "",
    eventType: "press",
    source: "raw",
    number: false,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    ...partial,
  } as unknown as KeyEvent);

describe("command keybindings", () => {
  test("undo matches ctrl+z, cmd+z, super+z, and u", () => {
    expect(commandMatches(key({ name: "z", ctrl: true }), "app:undo")).toBe(true);
    expect(commandMatches(key({ name: "z", meta: true }), "app:undo")).toBe(true);
    expect(commandMatches(key({ name: "z", super: true }), "app:undo")).toBe(true);
    expect(commandMatches(key({ name: "u" }), "app:undo")).toBe(true);
  });

  test("redo matches ctrl+y, ctrl+shift+z, cmd+shift+z, and ctrl+r", () => {
    expect(commandMatches(key({ name: "y", ctrl: true }), "app:redo")).toBe(true);
    expect(commandMatches(key({ name: "z", ctrl: true, shift: true }), "app:redo")).toBe(true);
    expect(commandMatches(key({ name: "z", meta: true, shift: true }), "app:redo")).toBe(true);
    expect(commandMatches(key({ name: "r", ctrl: true }), "app:redo")).toBe(true);
  });

  test("popular app shortcuts match primary keys", () => {
    // Select all
    expect(commandMatches(key({ name: "a", ctrl: true }), "app:selectAll")).toBe(true);
    expect(commandMatches(key({ name: "a", meta: true }), "app:selectAll")).toBe(true);

    // Duplicate
    expect(commandMatches(key({ name: "d", ctrl: true }), "app:duplicate")).toBe(true);
    expect(commandMatches(key({ name: "d", meta: true }), "app:duplicate")).toBe(true);

    // Save
    expect(commandMatches(key({ name: "s", ctrl: true }), "app:save")).toBe(true);
    expect(commandMatches(key({ name: "s", meta: true }), "app:save")).toBe(true);

    // Command palette
    expect(commandMatches(key({ name: "k", ctrl: true }), "app:palette")).toBe(true);

    // Quick switch
    expect(commandMatches(key({ name: "p", ctrl: true }), "app:quickSwitch")).toBe(true);
  });
});
