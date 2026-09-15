/**
 * Confirms a downloaded file is a real media container by its magic bytes,
 * not just its extension. Pure functions — no `worker_threads`/ffmpeg
 * import — so they're unit-testable with plain in-memory Buffers.
 */
export function validateContainerHeader(buffer: Buffer): 'mp4' | 'webm' | null {
  if (buffer.length >= 8 && buffer.toString('hex', 4, 8) === '66747970') {
    return 'mp4'; // 'ftyp' box header
  }
  if (buffer.length >= 4 && buffer.toString('hex', 0, 4) === '1a45dfa3') {
    return 'webm'; // EBML header
  }
  return null;
}

/** Image counterpart of `validateContainerHeader` (image jobs, Beta). */
export function validateImageHeader(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buffer.length >= 3 && buffer.toString('hex', 0, 3) === 'ffd8ff') {
    return 'jpeg'; // SOI marker
  }
  if (buffer.length >= 8 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}
