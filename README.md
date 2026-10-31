# lazydraw (highstat fork)

[![license](https://img.shields.io/github/license/highstat/lazydraw)](LICENSE)
[![repo](https://img.shields.io/badge/github-highstat%2Flazydraw-blue)](https://github.com/highstat/lazydraw)

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ ≡ │ box select arrow line text eraser │ export │ ⟲ ⟳ │ ⚙ │ ?    │
  └─────────────────────────────────────────────────────────────────┘

  ┌──────────┐      ┌──────────┐       ┌─────────┐      ┌─────────────┐
  │    I     ├─────►│   love   ├───┬──►│   bun   ├─────►│   lazydraw  │
  └──────────┘      └──────────┘   │   └────┬────┘      └──────┬──────┘
                                   │        │                  │
                                   │        │                  │
  ┌──────────┐      ┌──────────┐   │   ┌────┴────┐      ┌──────▼──────┐
  │   draw   │◄─────┤   fast   │◄──┘   │ highstat│      │   Saved.    │
  └──────────┘      └──────────┘       └─────────┘      └─────────────┘
```

`lazydraw` is a fast, responsive terminal ASCII diagram editor and sketching tool for building flowcharts, architecture diagrams, and tables in your terminal, with export to ASCII, UTF-8, Markdown, and PNG.

> **Note**: This is an enhanced fork maintained by [highstat](https://github.com/highstat) with macOS shortcuts, Kitty keyboard protocol support, contextual table generation, floating selection mini-bar, direct PNG export, and improved saving UX.

---

## What's Changed in this Fork (New Features & Enhancements)

- **First-Class macOS `Cmd+Z` / `Cmd+Shift+Z` Undo/Redo**:
  - Full Kitty Keyboard Protocol progressive enhancement (`\x1b[>1u` and CSI `u` escape sequence normalization).
  - Works natively with modern terminals: Ghostty, Kitty, WezTerm, iTerm2, Alacritty, and Apple Terminal.
  - Sanitized modifier parsing so modifier keys don't interfere with Backspace or Delete.

- **Floating Context Mini-Bar over Selections**:
  - 1-click contextual action bar floating directly above the active selection:
    `[Shape: rect]` · `[Style: single]` · `[Dup]` · `[Align]` · `[Del]` · `[✕]`.
  - Can be dismissed instantly via the `[✕]` button, toggled in Settings (`Ctrl+,`), or via Command Palette (`view:toggleMiniBar`).

- **Contextual ASCII & Markdown Table Generator (`Cmd+T` / `app:insertTable`)**:
  - Insert customizable grid tables (`<cols>x<rows>`) with single, double, or dashed borders.
  - **Smart Placement**: Automatically creates the table directly at your active selection or mouse cursor instead of viewport center.

- **Native High-Resolution PNG Export (`--format png`)**:
  - Export diagrams directly to clean, retina-ready PNG images powered by `@resvg/resvg-js`.
  - Available both in CLI (`lazydraw export <name> --format png -o diagram.png`) and inside the interactive TUI export panel.

- **Transparent Saving & Workflow Indicators**:
  - **Interactive Status Bar Indicator**: Click or inspect `[● Unsaved (Save)]` / `[✓ Saved]`.
  - **Save As... Dialog (`Cmd+Shift+S`)**: Save drawings to custom names and paths on disk.
  - **Quick Save Actions**: Immediate `[save]` and `[save as...]` buttons inside the file browser popover.

- **Reliable Text Tool & Auto-Commit**:
  - Text input is never lost or discarded when switching tools or clicking another position; uncommitted text automatically commits to the canvas.

- **Curated & Collapsible Themes**:
  - Shows top 10 popular themes by default (`terminal`, `tokyo-night`, `catppuccin`, `dracula`, `nord`, `gruvbox`, `one-dark`, `monokai`, `night-owl`, `github-light`).
  - Click `[+36 more...]` to view the full library of 46 themes.

- **Full Unicode & Cyrillic Support**:
  - Drawing file names preserve Russian and international Unicode characters without corrupting `.ld.json` paths.
  - Brush / eraser size shortcuts support both `[` / `]` and Russian keyboard layout `х` / `ъ` with visual feedback toasts.

- **Full Selection Deletion**:
  - `Ctrl/Cmd+A` followed by `Del` or `Backspace` reliably wipes the entire selection across all tools.

---

## Install

### 1-Line Installer (Zero Dependencies, Standalone Binary)

No Bun, Node.js, or external runtimes required. Automatically downloads the compiled binary for your OS and architecture:

**macOS & Linux**:
```sh
curl -fsSL https://raw.githubusercontent.com/highstat/lazydraw/main/install.sh | bash
```

**Windows (PowerShell)**:
```powershell
irm https://raw.githubusercontent.com/highstat/lazydraw/main/install.ps1 | iex
```

---

### Via Bun

```sh
# Run instantly from GitHub
bunx github:highstat/lazydraw

# Install globally
bun install -g github:highstat/lazydraw
```

---

### From Source

Requires [Bun](https://bun.sh) (v1.3+).

```sh
git clone https://github.com/highstat/lazydraw.git
cd lazydraw
bun install
bun run build # builds standalone binary at dist/lazydraw
```

---

## Usage

```sh
lazydraw                     # open the last drawing
lazydraw architecture        # open or create a drawing by name
lazydraw ./diagram.ld.json   # open a specific file
lazydraw --import notes.txt  # import text as a diagram
```

### Exporting from CLI

Export a drawing directly to PNG or ASCII text without launching the TUI:

```sh
# Export to high-res PNG image
lazydraw export architecture --format png -o architecture.png

# Export to ASCII with Markdown code fence
lazydraw export architecture --basic --fenced -o diagram.txt

# List all stored drawings
lazydraw list
```

---

## Shortcuts & Controls

| Shortcut | Action |
|---|---|
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` / `Ctrl+Y` | Redo |
| `Cmd+S` / `Ctrl+S` | Save drawing |
| `Cmd+Shift+S` | Save drawing as... |
| `Cmd+T` | Insert ASCII / Markdown table |
| `Cmd+A` / `Ctrl+A` | Select all |
| `Del` / `Backspace` | Erase selection |
| `Cmd+C` / `Cmd+X` / `Cmd+V` | Copy, cut, paste selection |
| `Cmd+D` | Duplicate selection |
| `Cmd+K` | Command palette |
| `Cmd+,` | Settings popover |
| `b` / `s` | Cycle box shape / line style |
| `[` / `]` (or `х` / `ъ`) | Decrease / increase brush and eraser size |
| `1`–`6` or `r`,`v`,`a`,`l`,`t`,`e` | Switch tool (box, select, arrow, line, text, eraser) |
| `Space` + drag | Pan canvas |
| `Ctrl+Q` (twice) | Quit |

---

## Configuration & Storage

- **Drawings**: `${XDG_DATA_HOME:-~/.local/share}/lazydraw/drawings/<name>.ld.json`
- **Config**: `${XDG_CONFIG_HOME:-~/.config}/lazydraw/config.json`

Drawings are automatically saved when modified and on application exit.

---

## Development

```sh
bun install
bun start           # run from source
bun test            # run test suite (48 tests)
bun run typecheck   # TypeScript type check (tsc --noEmit)
bun run build       # build standalone binary at dist/lazydraw
```

---

## Acknowledgements & Upstream Notices

- **[Çağrı Gökpunar](https://github.com/cagrigokpunar/lazydraw)**: Author of the upstream `lazydraw` project.
- **[ASCIIFlow](https://github.com/lewish/asciiflow)** by Lewis Hemens: Core drawing logic, line routing, and glyph connections.
- **[OpenTUI](https://github.com/sst/opentui)** by SST: Terminal UI rendering engine.
- **[resvg-js](https://github.com/yisibl/resvg-js)**: High-performance SVG to PNG rasterization engine.

## License

[MIT License](LICENSE) © 2026 highstat.
Upstream notices and third-party licenses are documented in [LICENSE](LICENSE).
