// Image / video -> ASCII. Uses ffmpeg (present on most systems or easy to install)
// to decode one frame to grayscale, then maps luminance onto a character ramp.
import { Layer } from "./layer";
import { Vector } from "./vector";

export const MEDIA_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".avif",
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".flv",
  ".wmv",
  ".mpg",
  ".mpeg",
  ".ogv",
] as const;

export const DEFAULT_RAMP = " .:-=+*#%@";

export interface MediaInfo {
  width: number;
  height: number;
  duration: number | null;
}

export interface MediaOptions {
  /** Output width in character cells. */
  width?: number;
  /** Timestamp in seconds for videos (defaults to a representative frame). */
  at?: number;
  /** Use dark characters on light backgrounds. */
  invert?: boolean;
  ramp?: string;
  /** Overrides the automatic aspect correction (0.5 => terminal cells are twice as tall). */
  aspect?: number;
}

export function isMediaPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MEDIA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function ffmpeg(): string {
  const path = Bun.which("ffmpeg");
  if (!path) throw new Error("ffmpeg not found — install ffmpeg to import images and videos");
  return path;
}

function ffprobe(): string {
  const path = Bun.which("ffprobe");
  if (!path) throw new Error("ffprobe not found — install ffmpeg to import images and videos");
  return path;
}

export function probeMedia(file: string): MediaInfo {
  const result = Bun.spawnSync(
    [
      ffprobe(),
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      file,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(`can't read ${file} (ffprobe failed)`);
  let parsed: { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  try {
    parsed = JSON.parse(result.stdout.toString());
  } catch {
    throw new Error(`can't read ${file}`);
  }
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error(`${file} has no video stream`);
  const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
  return { width: stream.width, height: stream.height, duration: Number.isFinite(duration) ? duration : null };
}

/** Decodes one frame and converts it to a sparse ASCII layer. */
export function mediaToLayer(file: string, opts: MediaOptions = {}): Layer {
  const info = probeMedia(file);
  const width = Math.max(8, Math.min(240, Math.round(opts.width ?? 80)));
  const aspect = opts.aspect ?? 0.5;
  const height = Math.max(1, Math.min(240, Math.round((info.height / info.width) * width * aspect)));
  const at =
    opts.at ??
    (info.duration != null && info.duration > 2 ? Math.min(info.duration / 2, 1.5) : 0);
  const ffmpegArgs = [
    ffmpeg(),
    "-v",
    "error",
    ...(at > 0 ? ["-ss", at.toFixed(3)] : []),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:${height}:flags=area,format=gray`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ];
  const result = Bun.spawnSync(ffmpegArgs, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg could not decode ${file}: ${result.stderr.toString().trim().split("\n").at(-1) ?? "unknown error"}`);
  }
  const bytes = new Uint8Array(result.stdout);
  if (bytes.length < width * height) throw new Error(`ffmpeg returned ${bytes.length} bytes, expected ${width * height}`);

  const ramp = opts.invert ? [...(opts.ramp ?? DEFAULT_RAMP)].reverse().join("") : (opts.ramp ?? DEFAULT_RAMP);
  const chars = [...ramp];
  const layer = new Layer();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = bytes[y * width + x]!;
      const ch = chars[Math.min(chars.length - 1, Math.floor((value / 256) * chars.length))]!;
      // Spaces stay empty so the drawing remains sparse and editable.
      if (ch !== " ") layer.set(new Vector(x, y), ch);
    }
  }
  return layer;
}
