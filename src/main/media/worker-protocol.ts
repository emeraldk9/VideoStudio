export interface PostProcessRequest {
  jobId: string;
  inputPath: string;
  thumbnailOutputPath: string;
  ffmpegPath: string;
  /** Drives header validation and thumbnail extraction. Defaults to 'video' when absent (pre-Beta callers). */
  mediaType?: 'image' | 'video';
}

export interface PostProcessResponse {
  jobId: string;
  /**
   * Whether the DOWNLOADED MEDIA is usable — not whether a thumbnail was made.
   *
   * The two used to be one flag, which meant a poster frame ffmpeg declined to
   * write failed the whole job and discarded a generation Flow had already
   * produced. A thumbnail is a convenience; the file is the deliverable.
   */
  success: boolean;
  fileSizeBytes: number;
  /**
   * Only ever set when a frame was actually written to disk. It used to be set
   * unconditionally on the happy path, but ffmpeg can exit 0 having written
   * nothing at all (`Output file is empty, nothing was encoded` — exactly what
   * `-ss 00:00:01` does to a clip shorter than a second), so the row stored a
   * path to a file that never existed and the Library rendered a broken image
   * for it forever.
   */
  thumbnailPath?: string;
  /** Why `success` is false — the media itself could not be used. */
  error?: string;
  /**
   * The file arrived and validated, but could not be decoded — the signature of
   * a truncated download rather than a broken pipeline. Lets the queue treat it
   * as RECOVERABLE (re-download on the next attempt) instead of spending the
   * job's whole retry budget on one attempt, which is what dead-lettered a
   * generation Flow had already produced.
   */
  mediaUnusable?: boolean;
}
