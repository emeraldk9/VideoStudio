import fs from 'node:fs';

import type { RenderEncoderInfo, TextContent } from '@shared';

import { videoEncodeArgs } from './render-encoder';

/**
 * Beta S154 phase 5 — one text clip → one rendered segment.
 *
 * Two rules carry the whole file:
 *
 * - **`textfile=`, never `text=`.** `drawtext`'s inline `text` parameter
 *   needs `:`, `'`, `\`, `%` and newlines escaped, and getting it wrong fails
 *   silently or renders literal escapes — the same class of trap
 *   `buildConcatFileList`'s quote-escaping exists for. The caller writes the
 *   string to the render's work dir and this builder points at the file; the
 *   only thing that ever needs escaping is the *path*, whose rules are small
 *   and testable.
 * - **`fontfile=` is mandatory.** Family names resolve through fontconfig,
 *   which `ffmpeg-static` does not ship on Windows. The app's own UI fonts
 *   are woff2 (freetype cannot load those), so burned-in text uses a resolved
 *   system TTF — a disclosed approximation, recorded in the step file; an
 *   Inter TTF as an extraResource is the named upgrade path.
 */

/** First existing candidate wins. Bold-leaning: burned-in text is display type. */
const FONT_CANDIDATES: Partial<Record<NodeJS.Platform, string[]>> = {
  win32: [
    'C:\\Windows\\Fonts\\segoeuib.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ],
  darwin: [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
  ],
  linux: [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ],
};

/** Resolved once per process — the font list is static and the stats are cheap but pointless to repeat. */
let cachedFontPath: string | null | undefined;

export function resolveDrawtextFont(platform: NodeJS.Platform = process.platform): string | null {
  if (cachedFontPath !== undefined && platform === process.platform) return cachedFontPath;
  const found =
    (FONT_CANDIDATES[platform] ?? []).find((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    }) ?? null;
  if (platform === process.platform) cachedFontPath = found;
  return found;
}

/**
 * Escapes a path for use inside a drawtext option value.
 *
 * The two that matter: backslashes become forward slashes (both freetype and
 * ffmpeg accept them on Windows) and the drive colon is escaped as `\:` —
 * unescaped it terminates the option. Quoting the whole value in `'` handles
 * spaces.
 */
export function escapeDrawtextPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** #rrggbb → ffmpeg 0xRRGGBB. The schema guarantees the shape; clamp anyway. */
function ffmpegColor(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `0x${hex.slice(1)}` : '0xFFFFFF';
}

export interface TextSegmentOptions {
  content: TextContent;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  /**
   * Transparent for an overlay-track segment (qtrle, composited later);
   * opaque black for a spine segment (h264, concatenated like any other).
   */
  transparent: boolean;
  fontFilePath: string;
  /** Where the caller wrote the clip's text. */
  textFilePath: string;
  draft?: boolean;
  /**
   * S248 — the encode side only, and only on the opaque branch: the
   * transparent one is `qtrle` for the alpha reason, and the input is a
   * `lavfi` colour source with nothing to decode.
   */
  encoder?: RenderEncoderInfo;
}

/** The drawtext filter string alone — exported so tests can pin it without the arg scaffolding. */
export function buildDrawtextFilter(options: TextSegmentOptions): string {
  const scale = options.draft ? 0.5 : 1;
  const { content } = options;
  const fontSize = Math.max(4, Math.round(clamp(content.fontSizePx, 8, 400) * scale));
  const x = clamp(content.positionPct.x, 0, 1);
  const y = clamp(content.positionPct.y, 0, 1);

  // Alignment resolves to an x *expression*: the fraction names the anchor
  // (left edge, centre, right edge of the text block respectively).
  const xExpr =
    content.align === 'left'
      ? `w*${x.toFixed(4)}`
      : content.align === 'right'
        ? `w*${x.toFixed(4)}-text_w`
        : `w*${x.toFixed(4)}-text_w/2`;

  // S160 — the vertical anchor, same shape one axis down. Absent = middle,
  // the pre-S160 hardcoded behaviour, so old documents render byte-identical.
  const yExpr =
    content.anchor === 'top'
      ? `h*${y.toFixed(4)}`
      : content.anchor === 'bottom'
        ? `h*${y.toFixed(4)}-text_h`
        : `h*${y.toFixed(4)}-text_h/2`;

  const parts = [
    `fontfile='${escapeDrawtextPath(options.fontFilePath)}'`,
    `textfile='${escapeDrawtextPath(options.textFilePath)}'`,
    `fontsize=${fontSize}`,
    `fontcolor=${ffmpegColor(content.colorHex)}`,
    `x=${xExpr}`,
    `y=${yExpr}`,
  ];
  if (content.box) {
    parts.push(
      'box=1',
      `boxcolor=${ffmpegColor(content.box.colorHex)}@${clamp(content.box.opacity, 0, 1).toFixed(2)}`,
      `boxborderw=${Math.round(clamp(content.box.paddingPx, 0, 100) * scale)}`,
    );
  }
  return `drawtext=${parts.join(':')}`;
}

export function buildTextSegmentArgs(outputPath: string, options: TextSegmentOptions): string[] {
  const scale = options.draft ? 0.5 : 1;
  const width = Math.max(2, Math.round(clamp(options.width, 2, 7680) * scale));
  const height = Math.max(2, Math.round(clamp(options.height, 2, 4320) * scale));
  const evenWidth = width % 2 === 0 ? width : width + 1;
  const evenHeight = height % 2 === 0 ? height : height + 1;
  const fps = Math.max(1, Math.round(clamp(options.fps, 1, 120)));
  const duration = clamp(options.durationSeconds, 0.001, 86_400);

  const base = options.transparent ? 'black@0.0' : 'black';
  const format = options.transparent ? 'yuva420p' : 'yuv420p';
  const filter = [`format=${format}`, buildDrawtextFilter(options), 'setsar=1'].join(',');

  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${base}:s=${evenWidth}x${evenHeight}:r=${fps}:d=${duration.toFixed(3)}`,
    '-vf',
    filter,
  ];
  if (options.transparent) {
    args.push('-c:v', 'qtrle');
  } else {
    args.push(...videoEncodeArgs({ draft: options.draft, encoder: options.encoder }));
  }
  args.push(outputPath);
  return args;
}
