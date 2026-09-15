import { useEffect, useState } from 'react';

import type { WhiteboardPenPoint, WhiteboardTraceSettings } from '@shared';

/**
 * Beta S278 — the Sketch pattern's trace artifact, fetched for the preview.
 *
 * One invoke per (source, knobs, frame) — the main process answers from the
 * same content-addressed cache the export reads, so scrubbing a traced clip
 * costs one round trip ever, and previewing warms the render. `null` while
 * loading, on refusal (a path this app has no record of), or on failure —
 * the caller keeps the wipe approximation in all three cases, which is the
 * disclosed fallback rather than an error state.
 */

export interface WhiteboardTraceRequest {
  filePath: string;
  trace: WhiteboardTraceSettings;
  frameWidth: number;
  frameHeight: number;
}

export interface WhiteboardTraceArtifact {
  width: number;
  height: number;
  /** Row-major gray plane, values 0..254 — the export's time-map, verbatim. */
  map: Uint8Array;
  penPath: WhiteboardPenPoint[];
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function useWhiteboardTrace(
  request: WhiteboardTraceRequest | null,
): WhiteboardTraceArtifact | null {
  const key = request ? JSON.stringify(request) : null;
  const [state, setState] = useState<{ key: string; artifact: WhiteboardTraceArtifact } | null>(
    null,
  );

  useEffect(() => {
    if (!key || !request) return;
    let cancelled = false;
    void window.api.sequence.traceWhiteboard(request).then((payload) => {
      // A selection change during the round trip wins — this answer is about
      // a clip the user has already moved on from (the probe hook's rule).
      if (cancelled || !payload) return;
      setState({
        key,
        artifact: {
          width: payload.width,
          height: payload.height,
          map: decodeBase64(payload.mapBase64),
          penPath: payload.penPath,
        },
      });
    });
    return () => {
      cancelled = true;
    };
    // `key` is the request, serialized — the object identity changes per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Keyed rather than cleared, so a stale answer simply does not match.
  return state?.key === key ? (state?.artifact ?? null) : null;
}
