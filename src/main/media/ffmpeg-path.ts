import { app } from 'electron';
import path from 'node:path';

/**
 * Resolves the static ffmpeg binary path across dev and packaged builds.
 * Packaged: shipped via `forge.config.ts`'s `extraResource` (outside asar,
 * plain fs-reachable — no `.node` unpacking needed since this is a plain
 * executable, not a native Node addon). Dev: the npm package's own resolved
 * path (`ffmpeg-static`'s JS entry point path-resolves relative to itself,
 * which is exactly why it's marked `external` in vite.main.config.ts rather
 * than bundled).
 */
export function resolveFfmpegPath(): string {
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg-static', binName);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('ffmpeg-static') as string;
}
