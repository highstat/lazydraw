// Version snapshots: ${XDG_DATA_HOME:-~/.local/share}/lazydraw/history/<slug>/
// Each snapshot is a normal .ld.json file with a timestamp and reason in its name.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Layer } from "../core/layer";
import { dataDir, deserialize, serialize, slugify } from "./drawings";

export interface Snapshot {
  id: string;
  path: string;
  createdAt: number;
  reason: string;
  size: number;
}

const stamp = (d: Date) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "-",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
    String(d.getMilliseconds()).padStart(3, "0"),
  ].join("");

export class HistoryStore {
  constructor(readonly dir = join(dataDir(), "history")) {}

  private dirFor(name: string): string {
    return join(this.dir, slugify(name));
  }

  snapshot(name: string, layer: Layer, reason = "auto"): Snapshot | null {
    if (layer.size() === 0) return null;
    const dir = this.dirFor(name);
    try {
      mkdirSync(dir, { recursive: true });
      const now = new Date();
      const safeReason = slugify(reason).slice(0, 24) || "auto";
      const id = `${stamp(now)}-${safeReason}`;
      const path = join(dir, `${id}.ld.json`);
      writeFileSync(path, serialize(name, layer, now.toISOString(), now.toISOString()));
      return { id, path, createdAt: now.getTime(), reason, size: layer.size() };
    } catch {
      return null;
    }
  }

  list(name: string): Snapshot[] {
    const dir = this.dirFor(name);
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => n.endsWith(".ld.json"));
    } catch {
      return [];
    }
    const out: Snapshot[] = [];
    for (const n of names) {
      const path = join(dir, n);
      try {
        const { file } = deserialize(readFileSync(path, "utf8"));
        const parts = n.slice(0, -".ld.json".length).split("-");
        const reason = parts.slice(2).join("-") || "auto";
        out.push({
          id: n.slice(0, -".ld.json".length),
          path,
          createdAt: Date.parse(file.updatedAt) || 0,
          reason,
          size: file.cells.length,
        });
      } catch {
        // Skip corrupt snapshots.
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  load(id: string, name: string): Layer | null {
    try {
      return deserialize(readFileSync(join(this.dirFor(name), `${id}.ld.json`), "utf8")).layer;
    } catch {
      return null;
    }
  }

  prune(name: string, keep: number): void {
    if (keep <= 0) return;
    const dir = this.dirFor(name);
    const snapshots = this.list(name);
    for (const old of snapshots.slice(keep)) {
      try {
        rmSync(old.path, { force: true });
      } catch {
        // ignore
      }
    }
    void dir;
  }

  /** All drawings that have snapshots (used by the CLI). */
  drawings(): string[] {
    try {
      return readdirSync(this.dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      return [];
    }
  }
}

export function defaultHistoryDir(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "lazydraw", "history");
}
