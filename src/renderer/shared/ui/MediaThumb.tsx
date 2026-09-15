import { toMediaUrl } from '@shared';

export interface OutputRecord {
  id?: string;
  mimeType?: string;
  localPath: string;
  thumbnailPath?: string | null;
}

export function isVideoOutput(output: OutputRecord): boolean {
  return (output.mimeType?.startsWith('video/') ?? false) || output.localPath.endsWith('.mp4');
}

export function isAudioOutput(output: OutputRecord): boolean {
  return (output.mimeType?.startsWith('audio/') ?? false) || output.localPath.endsWith('.wav') || output.localPath.endsWith('.mp3');
}

export function posterSourceFor(filePath: string): string | undefined {
  return toMediaUrl(filePath);
}
