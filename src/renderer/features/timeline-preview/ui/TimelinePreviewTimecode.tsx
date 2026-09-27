import { useEffect, useState } from 'react';
import { formatTimecode } from '@shared';
import { transportClock, useSequenceStore } from '../../../entities/sequence';

export interface TimelinePreviewTimecodeProps {
  fps: number;
  durationFrames: number;
}

/**
 * Isolated high-performance timecode HUD component.
 * Subscribes to `transportClock` directly during playback to render 60 FPS
 * display updates without triggering expensive re-renders of the main preview tree.
 */
export function TimelinePreviewTimecode({ fps, durationFrames }: TimelinePreviewTimecodeProps) {
  const storedFrame = useSequenceStore((state) => state.playheadFrame);
  const playing = useSequenceStore((state) => state.playing);
  const [frame, setFrame] = useState(storedFrame);

  useEffect(() => {
    if (!playing) {
      setFrame(storedFrame);
      return;
    }
    const unsub = transportClock.subscribe((liveFrame) => {
      setFrame(Math.max(0, Math.round(liveFrame)));
    });
    return unsub;
  }, [playing, storedFrame]);

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-bg-app px-2.5 py-1 select-none shadow-xs">
      <span className="material-symbols-outlined text-[14px] text-accent-ai">schedule</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-text-primary">
        {formatTimecode(frame, fps)}
      </span>
      <span className="font-mono text-xs text-text-disabled">/</span>
      <span className="font-mono text-xs tabular-nums text-text-secondary">
        {formatTimecode(durationFrames, fps)}
      </span>
    </div>
  );
}
