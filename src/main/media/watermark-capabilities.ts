import { execFile } from 'node:child_process';
import util from 'node:util';

import { Logger } from '../logging/logger';

import {
  parseEncoders,
  parseFilters,
  parseHwaccels,
  pickVideoEncoder,
  type VideoEncoder,
} from './watermark-args';

const execFileAsync = util.promisify(execFile);
const logger = Logger.createChildLogger('watermark-capabilities');

/**
 * Beta S235 — what the bundled ffmpeg can actually do, asked once.
 *
 * ## Why probe instead of hardcoding
 *
 * `ffmpeg-static` resolves to a different build per platform, and the app has
 * never been packaged for macOS against a real certificate, so the darwin
 * binary's feature set is genuinely unknown here. Measured on the Windows build
 * (`6.1.1-essentials_build-www.gyan.dev`): NVENC, QSV and AMF encoders for
 * H.264/HEVC/AV1, `-hwaccels` of `cuda, dxva2, qsv, d3d11va`, and **both**
 * `delogo` and `removelogo`. macOS is expected to carry `h264_videotoolbox`
 * and no NVENC.
 *
 * Hardcoding that table would mean a batch failing on someone else's machine
 * with an ffmpeg error rather than quietly running a little slower on libx264.
 *
 * ## Why the result is cached for the process lifetime
 *
 * Three subprocess launches, ~150 ms, for an answer that cannot change while the
 * app runs — the binary is fixed at package time. Probing per batch would put
 * that on the critical path of every run for no new information. It is *not*
 * cached across restarts: an app update can replace the binary, and a stale
 * capability file is exactly the kind of thing that produces an unreproducible
 * "works on my machine".
 */

export interface FfmpegCapabilities {
  encoders: ReadonlySet<string>;
  filters: ReadonlySet<string>;
  /**
   * Beta S248 — the `-hwaccels` listing, for the timeline render's decode
   * side. Separate from `encoders` because the two are genuinely independent:
   * a machine can decode on the GPU and have no hardware *encoder*, and the
   * reverse happens on locked-down VMs.
   */
  hwaccels: ReadonlySet<string>;
  /** The best hardware encoder available, or `libx264` on a bare machine. */
  preferredEncoder: VideoEncoder;
  /** `delogo` is GPL-only, so an LGPL build will not have it. */
  hasDelogo: boolean;
  /** `removelogo` takes a mask image, which is how a non-rectangular mark is filled. */
  hasRemovelogo: boolean;
}

let cached: Promise<FfmpegCapabilities> | null = null;

async function listing(ffmpegPath: string, flag: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(ffmpegPath, ['-hide_banner', flag], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    // A probe that fails is not fatal: an empty listing degrades every ladder
    // to its universal fallback, which still produces a working command.
    logger.warn('ffmpeg capability probe failed', {
      flag,
      error: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

export function probeFfmpegCapabilities(ffmpegPath: string): Promise<FfmpegCapabilities> {
  cached ??= (async () => {
    const [encoderText, filterText, hwaccelText] = await Promise.all([
      listing(ffmpegPath, '-encoders'),
      listing(ffmpegPath, '-filters'),
      listing(ffmpegPath, '-hwaccels'),
    ]);
    const encoders = parseEncoders(encoderText);
    const filters = parseFilters(filterText);
    const capabilities: FfmpegCapabilities = {
      encoders,
      filters,
      hwaccels: parseHwaccels(hwaccelText),
      preferredEncoder: pickVideoEncoder(encoders),
      hasDelogo: filters.has('delogo'),
      hasRemovelogo: filters.has('removelogo'),
    };
    logger.info('ffmpeg capabilities', {
      preferredEncoder: capabilities.preferredEncoder,
      hwaccels: [...capabilities.hwaccels].join(','),
      hasDelogo: capabilities.hasDelogo,
      hasRemovelogo: capabilities.hasRemovelogo,
      encoderCount: encoders.size,
    });
    return capabilities;
  })();
  return cached;
}

/** Tests only — the cache is process-wide and would otherwise leak between suites. */
export function resetCapabilitiesCacheForTests(): void {
  cached = null;
}
