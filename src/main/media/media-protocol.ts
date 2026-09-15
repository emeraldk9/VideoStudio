import { app, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { MEDIA_HOST, MEDIA_PROTOCOL } from '@shared';

import { Logger } from '../logging/logger';

import { resolveFfmpegPath } from './ffmpeg-path';
import { ThumbnailCache, parseThumbnailWidth } from './thumbnail-cache';

const logger = Logger.createChildLogger('media-protocol');

/**
 * Content types this protocol serves, by extension.
 *
 * Explicit rather than inferred: `<video>` refuses a source whose type it
 * cannot determine, and the previous `net.fetch(file://…)` implementation left
 * the type to Chromium's file handler, which is not guaranteed to label a
 * `.mp4` usefully. Anything unlisted is served as a generic byte stream, which
 * an `<img>`/`<video>` will sniff — the fallback is deliberately not
 * `text/plain`, which some elements refuse outright.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  // Beta S180 — the rest of what the media pool imports. Added with the
  // imported-media allowlist and not before: until then no path with one of
  // these extensions could reach this handler at all, so the generic
  // fallback was never exercised on them. It would not have been enough —
  // `<audio>` is the element least willing to sniff `application/octet-stream`,
  // which is exactly what an imported .m4a or .flac would have been served as.
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
  '.3gp': 'video/3gpp',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  // Audio
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.ac3': 'audio/ac3',
  '.mka': 'audio/x-matroska',
};

function contentTypeFor(absolutePath: string): string {
  return CONTENT_TYPE_BY_EXTENSION[path.extname(absolutePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Parses one HTTP byte range against a known file size.
 *
 * Only the single-range form is handled (`bytes=start-end`, `bytes=start-`,
 * `bytes=-suffix`) — that is all Chromium's media stack ever sends, and
 * answering a multi-range request with a single range would be a lie about
 * what the response contains.
 *
 * Returns `null` for a header this code does not handle (the caller then
 * serves the whole file, which is valid), and `'unsatisfiable'` for a range
 * that cannot be met, which must be a 416 rather than a silent full body.
 *
 * Exported for tests: off-by-one errors here surface as "video plays but
 * seeking is subtly wrong", which is expensive to spot by hand.
 */
export function parseByteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  // An empty file can satisfy no range at all — `end` would be -1.
  if (size === 0) return 'unsatisfiable';

  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix form: `bytes=-500` means the LAST 500 bytes, not "up to 500".
    const suffixLength = Number(rawEnd);
    if (suffixLength === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end };
}

/**
 * Serves generated outputs and thumbnails to the renderer.
 *
 * The Library screen put a bare OS path straight into `<img src>`, which a
 * sandboxed renderer with `contextIsolation` cannot load — no `file://`
 * protocol is granted to it, and none was registered anywhere in the app. So
 * every locally-generated thumbnail silently rendered as a broken image while
 * the row itself looked fine.
 *
 * Scoped to the managed outputs directory, deliberately: this is a read
 * primitive exposed to page content, and page content must not be able to walk
 * it to arbitrary files. The containment check mirrors `outputs-ipc.ts`'s
 * `assertContained`, applied to the *resolved* path so `..` segments can't
 * escape.
 *
 * ## The second, narrower allowance
 *
 * Reference images live wherever the user picked them (`D:\Work\Jack.jpeg`),
 * not under `userData`, so the queue card could never render one — the
 * thumbnail fell back to a text chip for every reference the user actually
 * uses. `isKnownReference` widens the door by exactly one hinge: a path the
 * app has already recorded in its own database as a job input or a character
 * reference, i.e. a file *this user explicitly attached through this app*.
 *
 * That is an allowlist derived from data, not a directory. Page content cannot
 * add to it, cannot enumerate it, and cannot walk from one entry to another —
 * an arbitrary path is still refused, `..` still cannot escape (the path is
 * resolved before it is checked), and a path that was attached and later
 * removed stops being servable.
 *
 * `handle` is used rather than the deprecated `registerFileProtocol`. Range
 * requests — which video playback requires before it will start, not merely to
 * seek — are served explicitly by `serveFile` below; see its doc comment for
 * why delegating to `net.fetch(file://…)` cannot work no matter how the
 * headers are passed.
 */
/**
 * The absolute filesystem path a `media://` request refers to.
 *
 * Taken off the raw URL string, NOT via `new URL().pathname`. `media:` is
 * registered as a *standard* scheme, so Chromium canonicalises it like
 * `scheme://host/path` — and a Windows path after an empty authority
 * (`media:///D:/Work/x.jpg`) is exactly the shape that treats inconsistently:
 * the drive letter can end up read as the host, in which case `pathname` no
 * longer contains it and the resolved path is silently wrong.
 *
 * Stripping the scheme and any leading slashes yields the same result from
 * either spelling, so nothing here depends on which one arrived.
 *
 * Exported for tests: this is the step where a wrong answer looks exactly like
 * a permissions problem, which is expensive to diagnose from the outside.
 */
export function resolveMediaRequestPath(requestUrl: string): string {
  // A raw `?query` or `#fragment` is never part of the file path — the TTS
  // panels append a cache-busting `?t=N` so an in-place rewritten preview
  // file re-fetches, and left in place it reached `fs.stat` as literal
  // characters: every voice preview 404'd as "file no longer there"
  // (owner-reported 2026-08-11, playback silently dead while synthesis
  // succeeded). Stripped from the *raw* URL, so an encoded `%23` in a file
  // name still decodes below.
  const requested = requestUrl.replace(/[?#][\s\S]*$/, '');
  const prefix = `${MEDIA_PROTOCOL}://${MEDIA_HOST}/`;
  let rawPath: string;
  if (!requested.startsWith(prefix)) {
    rawPath = decodeURIComponent(requested.slice(`${MEDIA_PROTOCOL}:`.length).replace(/^\/+/, ''));
  } else {
    rawPath = decodeURIComponent(requested.slice(prefix.length));
  }
  // On Windows, Chromium can prepend leading slashes before drive letters (e.g. "/C:/Users" or "///C:/Users").
  // Node's path.resolve('/C:/...') corrupts this into 'C:\C:\...' causing 404s.
  // Strip any leading slashes/backslashes before a drive letter:
  const normalized = rawPath.replace(/^[/\\]+([a-zA-Z]:)/, '$1');
  return path.resolve(normalized);
}

/**
 * Whether a resolved path sits inside a resolved directory — either the
 * directory itself or something under it.
 *
 * Plain prefix comparison would pass `/managed-extra` against root
 * `/managed`; the `path.sep` suffix on the root is what keeps a sibling
 * directory that merely shares a prefix from reading as "inside".
 *
 * Exported so both the managed-outputs check below and any other
 * directory-scoped allowlist (Story Builder's project roots, in
 * `bootstrap.ts`) share one definition, and so it's unit-testable without an
 * `electron` import.
 */
export function isPathWithinRoot(absolutePath: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  return absolutePath === resolvedRoot || absolutePath.startsWith(resolvedRoot + path.sep);
}

export function registerMediaProtocol(isKnownReference?: (absolutePath: string) => boolean): void {
  const baseDir = path.resolve(path.join(app.getPath('userData'), 'projects'));
  // Beta S313. Built here rather than injected from `bootstrap.ts` because the
  // cache is an implementation detail of serving media — nothing else in the
  // app has a reason to hold one, and threading it through the composition
  // root would put a media concern in a file that only wires domains together.
  const thumbnails = new ThumbnailCache(
    path.join(app.getPath('userData'), 'thumb-cache'),
    resolveFfmpegPath(),
  );

  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    let requested: string;
    try {
      requested = resolveMediaRequestPath(request.url);
    } catch {
      return new Response('Bad media URL', { status: 400 });
    }

    const insideManagedDir = isPathWithinRoot(requested, baseDir);
    if (!insideManagedDir && !isKnownReference?.(requested)) {
      // The path is logged: without it this warning says only that *something*
      // was refused, which is unactionable — and a refusal here is always
      // either a bug in the allowlist or an attempt worth seeing.
      logger.warn('media:// request refused — neither managed nor an attached reference', {
        requested,
        rawUrl: request.url,
      });
      return new Response('Forbidden', { status: 403 });
    }

    // Beta S313 — `?thumb=<width>`. Resolved *after* the allowlist check, so a
    // thumbnail can only ever be derived from a file the caller was already
    // entitled to read whole; the parameter widens no door.
    const width = parseThumbnailWidth(request.url);
    if (width !== null) {
      const source = await statOrNull(requested);
      if (source) {
        const cached = await thumbnails.lookup(requested, width, source.mtimeMs);
        if (cached) {
          // Content-addressed by (path, mtime, width), so this URL's bytes can
          // never change meaning — an edit to the source mints a different
          // cache key rather than new content under the old one.
          return serveFile(cached, request.headers.get('range'), insideManagedDir, IMMUTABLE_CACHE);
        }
      }
      // Miss, or a source that is gone: fall through and serve the original at
      // full size. `lookup` has scheduled the generation, so the next paint of
      // this tile gets the small one.
    }

    return serveFile(requested, request.headers.get('range'), insideManagedDir);
  });
}

/** `Cache-Control` for content-addressed thumbnails; see the call site. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * Beta S313 — the mtime a cache key needs, or `null` if the file is gone.
 *
 * Separate from `serveFile`'s own `stat` on purpose: a miss here must fall
 * through to the ordinary path so the 404 is produced by one code path with
 * one log line, rather than being answered twice in two different shapes.
 */
async function statOrNull(absolutePath: string): Promise<fs.Stats | null> {
  try {
    const stats = await fs.promises.stat(absolutePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

/**
 * Serves a file, honouring a byte range.
 *
 * ## Why this is hand-rolled rather than `net.fetch(file://…)`
 *
 * It used to be `net.fetch`, chosen on the belief that range requests would
 * then "just work". They do not, in two successive ways:
 *
 * 1. `net.fetch(url)` with no init forwards no headers, so the incoming
 *    `Range` never reached the file handler at all. Fixed on 2026-07-29 by
 *    passing `headers: request.headers` — which did not fix playback.
 * 2. Chromium's `file://` handler **ignores `Range` regardless**. It answers
 *    `200` with the entire body and no `Accept-Ranges`/`Content-Range`. The
 *    media stack requires a `206` to a range request before it will start a
 *    partial fetch, so `<video>` issued exactly one request, got a full-body
 *    200, and stalled — while `<img>` was unaffected, because images are
 *    fetched whole and never ask for a range.
 *
 * The app's own logs show precisely that: one `media:// serving` line carrying
 * `range: "bytes=0-"` for a 2.1 MB .mp4, and then nothing.
 *
 * So the range is served here, from a `fs.createReadStream` over the requested
 * slice. That also lets the response carry a correct `Content-Type` and
 * `Content-Length`, neither of which the file handler guaranteed.
 */
async function serveFile(
  absolutePath: string,
  rangeHeader: string | null,
  insideManagedDir: boolean,
  /**
   * Beta S313. Defaults to a short revalidating window rather than the
   * `immutable` the thumbnails get, because an *original* is genuinely mutable
   * in this app: watermark removal rewrites an output in place, and a re-render
   * overwrites a poster frame. Caching those for a year would keep painting the
   * watermarked picture long after it was cleaned.
   *
   * A minute is enough to cover the case that actually hurt — scrolling a grid
   * back and forth re-`stat`ing and re-reading every file from disk — while
   * keeping an in-place edit visible within a scroll or two.
   */
  cacheControl = 'public, max-age=60',
): Promise<Response> {
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(absolutePath);
  } catch {
    // A row can outlive its file — the user moved or deleted it outside the
    // app. 404 rather than a thrown handler, which surfaces as an opaque
    // network error in the renderer.
    logger.warn('media:// request for a file that is no longer there', { requested: absolutePath });
    return new Response('Not found', { status: 404 });
  }
  if (!stats.isFile()) {
    return new Response('Not found', { status: 404 });
  }

  const size = stats.size;
  const contentType = contentTypeFor(absolutePath);
  const range = parseByteRange(rangeHeader, size);

  logger.debug('media:// serving', {
    requested: absolutePath,
    insideManagedDir,
    size,
    range: rangeHeader ?? undefined,
    status: range === 'unsatisfiable' ? 416 : range ? 206 : 200,
  });

  if (range === 'unsatisfiable') {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
    });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  // An empty file has no byte to stream; `createReadStream` with end = -1
  // would throw. 200 with a zero-length body is the honest answer.
  const body =
    size === 0
      ? null
      : (Readable.toWeb(
          fs.createReadStream(absolutePath, { start, end }),
        ) as unknown as ReadableStream<Uint8Array>);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(size === 0 ? 0 : end - start + 1),
    // Advertised on every response, not just ranged ones: this is what tells
    // the media stack it may seek at all.
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  };
  if (range) {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }

  return new Response(body, { status: range ? 206 : 200, headers });
}

/**
 * Must be called before `app.whenReady()`. Grants the scheme the privileges the
 * renderer needs: `stream` for video range requests, `bypassCSP` so a strict
 * page CSP doesn't block the app's own media, and `supportFetchAPI` so it can
 * also be fetched rather than only used as an element `src`.
 */
export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: { standard: true, secure: true, stream: true, bypassCSP: true, supportFetchAPI: true },
    },
  ]);
}
