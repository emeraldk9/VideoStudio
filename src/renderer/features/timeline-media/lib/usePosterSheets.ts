import { useEffect, useState } from 'react';

import type { FilmstripSheet } from '@shared';

/**
 * Beta S183 — filmstrip sheets for the pool's video tiles, so an imported
 * video shows its **first frame** instead of the generic movie glyph.
 *
 * A Library video already has a `thumbnailPath` written by the download
 * pipeline. An imported one is a reference to a file the app never processed,
 * so it had nothing to show and the Imported tab's Videos tab was a grid of
 * identical rectangles distinguishable only by filename.
 *
 * Rather than extract a second poster per file, this reuses the sheet Beta
 * S182 already builds and caches for the timeline lanes: tile (0,0) *is* the
 * first frame, and `MediaTile` crops to it with a background-position sprite.
 * A file the user has already dropped on a lane therefore costs nothing here —
 * the main process answers from `sequence_clip_thumbs`.
 *
 * Fetch-once semantics follow `WaveformCanvas`/`FilmstripCanvas`: keyed by
 * path, guarded by an `in` check, with the state map deliberately absent from
 * the dependency list because the effect writes it.
 */
export function usePosterSheets(paths: readonly string[]): Record<string, FilmstripSheet | null> {
  const [sheets, setSheets] = useState<Record<string, FilmstripSheet | null>>({});

  // A stable key so the effect re-runs when the *set* of files changes, not on
  // every re-render that rebuilds an equal array.
  const pathsKey = paths.join('\n');

  useEffect(() => {
    let cancelled = false;
    for (const sourcePath of pathsKey ? pathsKey.split('\n') : []) {
      if (sourcePath in sheets) continue;
      void window.api.sequence
        .getFilmstrip(sourcePath)
        .then((sheet) => {
          if (!cancelled) setSheets((current) => ({ ...current, [sourcePath]: sheet }));
        })
        .catch(() => {
          // A source ffmpeg could not read. The tile falls back to its kind
          // glyph, which is honest — the file is still listed, draggable and
          // removable, and an invented thumbnail would be worse than none.
          if (!cancelled) setSheets((current) => ({ ...current, [sourcePath]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
    // `sheets` is written by this effect; depending on it would loop. The `in`
    // guard above is what makes each path fetch exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  return sheets;
}
