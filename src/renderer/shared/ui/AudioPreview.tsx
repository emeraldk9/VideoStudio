import { useEffect, useRef } from 'react';

import { IconButton } from './IconButton';

/**
 * Beta S182 — a preview player that plays because someone asked it to, never
 * because it mounted.
 *
 * ## The bug this replaces
 *
 * All three Voice panels rendered the same shape:
 *
 * ```tsx
 * {previewPath ? <audio src={toMediaUrl(previewPath)} controls autoPlay /> : null}
 * ```
 *
 * The path lives in a **module-level zustand store**; the player was
 * declarative. `TtsScreen` unmounts a panel on a mere tab switch and
 * `WorkspaceContainer` unmounts the whole screen on navigation — so returning
 * to the tab mounted a fresh `<audio autoPlay>` over a `previewPath` that had
 * never gone away, and the browser played it. Nobody had clicked ▶.
 *
 * ## The rule
 *
 * **Playback is a consequence of a user gesture, never of a render.** That is
 * what the HTML autoplay policy encodes; the app only got away with breaking it
 * because Electron grants user activation freely.
 *
 * The whole fix is one line: the token an instance mounted with counts as
 * *already played*. A play request is an event, and an event that happened
 * before this element existed is not one it should replay. Everything else
 * follows — including that `voicesStore` no longer has to key this element by a
 * nonce to force a remount, which was only ever a way to make `autoPlay` fire a
 * second time on an unchanged `src`.
 */
export interface AudioPreviewProps {
  /**
   * The media URL. Cache-busted by the store where the file is rewritten in
   * place.
   *
   * `undefined` renders nothing, which is what lets a call site pass
   * `toMediaUrl(path)` straight through — it answers `undefined` for a falsy
   * path, and an `<audio>` with no `src` is a broken transport, not an empty
   * one.
   */
  src: string | undefined;
  /**
   * Bumped by the store on every explicit audition. A *change* plays; the value
   * this component mounted with never does.
   */
  playToken: number;
  /**
   * Beta S211 — seek here before playing, in seconds.
   *
   * Added so the voice editor can play *exactly the ten seconds that will be
   * encoded* rather than the whole file, which is what makes the start-offset
   * control audible instead of a number typed blind. Absent plays from wherever
   * the transport already sits, which is what every other caller wants.
   */
  startSec?: number;
  /**
   * Beta S211 — pause this many seconds after {@link startSec}.
   *
   * A pause rather than a stop: the transport stays where it landed, so the
   * user can scrub on from the end of the window if they want to hear what
   * comes next.
   */
  stopAfterSec?: number;
  /** Renders a dismiss control when given. Without it the player can only be closed by its owner. */
  onDismiss?: () => void;
  /** The element's accessible name — say which player this is when a panel has two. */
  label?: string;
  className?: string;
}

export function AudioPreview({
  src,
  playToken,
  startSec,
  stopAfterSec,
  onDismiss,
  label = 'Preview',
  className = '',
}: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playedToken = useRef(playToken);

  useEffect(() => {
    if (playToken === playedToken.current) {
      return;
    }
    playedToken.current = playToken;

    const element = audioRef.current;
    if (!element) {
      return;
    }
    // Rewound explicitly: re-auditioning the same voice yields an identical
    // `src`, and an element parked at its end would otherwise sit there looking
    // like the click did nothing. S211 — or to the start of the window being
    // auditioned, which is the same idea aimed at part of the file.
    element.currentTime = startSec ?? 0;
    // A rejected play() is not worth surfacing — the transport is always
    // rendered, so the user still has the control they were denied.
    void element.play().catch(() => undefined);

    if (stopAfterSec === undefined) {
      return;
    }
    // Beta S211 — stopping is a listener rather than a timer because a timer
    // measures wall-clock, and the two diverge the moment the user pauses or
    // scrubs mid-window. `timeupdate` measures the thing actually being bounded.
    const stopAt = (startSec ?? 0) + stopAfterSec;
    const onTimeUpdate = () => {
      if (element.currentTime >= stopAt) {
        element.pause();
        element.removeEventListener('timeupdate', onTimeUpdate);
      }
    };
    element.addEventListener('timeupdate', onTimeUpdate);
    return () => element.removeEventListener('timeupdate', onTimeUpdate);
  }, [playToken, startSec, stopAfterSec]);

  // After the effect, not before: hooks cannot be conditional, and the effect's
  // own `ref.current` guard already covers the unrendered case.
  if (!src) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        controls
        // `auto` would fetch the file the moment the row rendered. This element
        // is a transport, not a reason to read a take off disk.
        preload="metadata"
        aria-label={label}
        className="min-w-0 flex-1"
      />
      {onDismiss ? <IconButton icon="close" label="Close the player" onClick={onDismiss} /> : null}
    </div>
  );
}
