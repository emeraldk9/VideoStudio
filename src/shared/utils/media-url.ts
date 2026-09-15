export const MEDIA_PROTOCOL = 'media';
export const MEDIA_HOST = 'local';

export function toMediaUrl(localPath: string | null | undefined): string | undefined {
  if (!localPath) {
    return undefined;
  }
  if (/^(https?|data|blob|media):/.test(localPath)) {
    return localPath;
  }
  return `${MEDIA_PROTOCOL}://${MEDIA_HOST}/${encodeURI(localPath.replace(/\\/g, '/'))}`;
}

export const THUMBNAIL_WIDTHS = [256, 512] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

export function toThumbUrl(
  localPath: string | null | undefined,
  width: ThumbnailWidth = 256,
): string | undefined {
  const base = toMediaUrl(localPath);
  if (!base) {
    return undefined;
  }
  if (!base.startsWith(`${MEDIA_PROTOCOL}:`)) {
    return base;
  }
  return `${base}${base.includes('?') ? '&' : '?'}thumb=${width}`;
}
