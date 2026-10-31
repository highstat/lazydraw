// Native file dialogs where the OS provides them. Returns null when the user
// cancels or the helper is unavailable (callers fall back to a text prompt).
import { basename } from "node:path";

export type PickerMode = "open" | "save";

function run(cmd: string[]): string | null {
  if (!Bun.which(cmd[0]!)) return null;
  try {
    const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return null;
    const value = result.stdout.toString().trim();
    return value || null;
  } catch {
    return null;
  }
}

function osascript(script: string): string | null {
  return run(["osascript", "-e", script]);
}

function powershell(script: string): string | null {
  return run(["powershell", "-NoProfile", "-STA", "-Command", script]) ?? run(["pwsh", "-NoProfile", "-STA", "-Command", script]);
}

function quoteApple(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function nativeFilePicker(mode: PickerMode, options: { title?: string; defaultName?: string } = {}): string | null {
  const title = options.title ?? (mode === "open" ? "Open file" : "Save file");
  if (process.platform === "darwin") {
    if (mode === "open") {
      return osascript(`POSIX path of (choose file with prompt "${quoteApple(title)}")`);
    }
    const name = quoteApple(options.defaultName ?? "export.txt");
    return osascript(
      `POSIX path of (choose file name with prompt "${quoteApple(title)}" default name "${name}")`,
    );
  }
  if (process.platform === "win32") {
    const filter = mode === "open" ? "All files|*.*" : "All files|*.*";
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      `$d = New-Object System.Windows.Forms.${mode === "open" ? "OpenFileDialog" : "SaveFileDialog"};`,
      `$d.Title = "${title.replace(/"/g, '`"')}";`,
      `$d.Filter = "${filter}";`,
      mode === "save" ? `$d.FileName = "${(options.defaultName ?? "export.txt").replace(/"/g, '`"')}";` : "",
      "if ($d.ShowDialog() -eq 'OK') { $d.FileName }",
    ].join(" ");
    return powershell(script);
  }
  // Linux/BSD: zenity or kdialog.
  if (Bun.which("zenity")) {
    const args =
      mode === "open"
        ? ["zenity", "--file-selection", `--title=${title}`]
        : ["zenity", "--file-selection", "--save", "--confirm-overwrite", `--title=${title}`, `--filename=${options.defaultName ?? "export.txt"}`];
    return run(args);
  }
  if (Bun.which("kdialog")) {
    const args =
      mode === "open"
        ? ["kdialog", "--getopenfilename", ".", "*", `--title=${title}`]
        : ["kdialog", "--getsavefilename", options.defaultName ?? "export.txt", `--title=${title}`];
    return run(args);
  }
  return null;
}

export function defaultExportName(name: string, extension: string): string {
  return `${basename(name).replace(/\.[^.]+$/, "") || "lazydraw"}.${extension}`;
}
