import zlib from 'node:zlib';

/**
 * Beta S275 — the pure-Node PNG encoder, as a runtime module.
 *
 * Lifted from `scripts/generate-hand-assets.cjs` (which keeps its own
 * build-time copy — it runs outside the app bundle): ~40 lines over `zlib`,
 * because the repo deliberately has no raster dependency. Two variants:
 * 8-bit grayscale for masks (the zone rasterizer's whole need — ffmpeg reads
 * them straight into `format=gray`) and RGBA for anything that later needs
 * color. No filtering (filter byte 0 per scanline), max deflate — masks are
 * runs of 0/255 and compress to nearly nothing.
 */

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function encode(pixels: Uint8Array, width: number, height: number, channels: 1 | 4): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 1 ? 0 : 6; // grayscale / RGBA
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    PNG_HEADER,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** One 8-bit gray plane as a PNG buffer. `gray.length` must be `width*height`. */
export function encodeGrayPng(gray: Uint8Array, width: number, height: number): Buffer {
  return encode(gray, width, height, 1);
}

/** An RGBA buffer as a PNG. `rgba.length` must be `width*height*4`. */
export function encodeRgbaPng(rgba: Uint8Array, width: number, height: number): Buffer {
  return encode(rgba, width, height, 4);
}

/**
 * S278 — the encoder's inverse, for PNGs **this module wrote**: 8-bit
 * grayscale, filter 0 on every scanline. It is not a general PNG reader and
 * refuses anything else — the one caller is the sequence IPC handler turning
 * a cached time-map back into the raw bytes the preview's canvas loop reads.
 */
export function decodeGrayPng(png: Buffer): { width: number; height: number; gray: Uint8Array } {
  if (!png.subarray(0, 8).equals(PNG_HEADER) || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG this module wrote');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 0) {
    throw new Error('not an 8-bit grayscale PNG');
  }
  let offset = 8;
  const idat: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    if (raw[y * (width + 1)] !== 0) throw new Error('unexpected PNG scanline filter');
    gray.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  }
  return { width, height, gray };
}
