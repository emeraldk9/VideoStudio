import React, { useEffect, useRef } from 'react';
import {
  buildMultiCamGridTiles,
  resolveAngleSourceTime,
  toMediaUrl,
  type SequenceClip,
} from '@shared';

export interface MultiCamGridProps {
  clip: SequenceClip;
  playheadFrame: number;
  fps: number;
  playing: boolean;
  playbackRate: number;
  onAngleSelect: (angleIndex: number) => void;
  onAngleCut: (angleIndex: number) => void;
}

/**
 * Beta S65 — Synchronized 4-Up MultiCam Canvas Display
 *
 * Renders a professional 2x2 multi-angle monitor view that synchronizes
 * multiple camera feeds with the sequence transport clock in real-time,
 * displaying broadcast tally indicators (Red for On-Air Program, Green on Hover)
 * and enabling instant live cut-on-the-fly editing.
 */
export const MultiCamGrid = React.memo(function MultiCamGrid({
  clip,
  playheadFrame,
  fps,
  playing,
  playbackRate,
  onAngleSelect,
  onAngleCut,
}: MultiCamGridProps) {
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const tiles = buildMultiCamGridTiles(clip, playheadFrame, fps);

  // Synchronize playback of all angle video decoders
  useEffect(() => {
    const isRealtime = playing && playbackRate === 1;

    tiles.forEach((tile) => {
      const video = videoRefs.current[tile.angleIndex];
      if (!video) return;

      const { sourceTimeSeconds } = resolveAngleSourceTime(
        clip,
        tile.angleIndex,
        playheadFrame,
        fps,
      );

      // Always mute angle preview monitors in the grid; master audio engine handles audio routing
      video.muted = true;

      if (isRealtime) {
        if (video.playbackRate !== 1) video.playbackRate = 1;
        if (Math.abs(video.currentTime - sourceTimeSeconds) > 0.25) {
          video.currentTime = sourceTimeSeconds;
        }
        if (video.paused) {
          void video.play().catch(() => undefined);
        }
      } else {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - sourceTimeSeconds) > 0.08) {
          video.currentTime = sourceTimeSeconds;
        }
      }
    });
  }, [tiles, clip, playheadFrame, fps, playing, playbackRate]);

  return (
    <div className="relative grid h-full w-full grid-cols-2 grid-rows-2 gap-1.5 bg-black p-1 select-none overflow-hidden rounded-lg border border-hairline/80 shadow-2xl">
      {tiles.slice(0, 4).map((tile) => {
        const angleMediaUrl = tile.angle.filePath
          ? toMediaUrl(tile.angle.filePath)
          : clip.filePath
            ? toMediaUrl(clip.filePath)
            : undefined;

        return (
          <div
            key={tile.angle.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (playing) {
                onAngleCut(tile.angleIndex);
              } else {
                onAngleSelect(tile.angleIndex);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (playing) {
                  onAngleCut(tile.angleIndex);
                } else {
                  onAngleSelect(tile.angleIndex);
                }
              }
            }}
            title={`${tile.angle.cameraLabel} (${tile.isOnAir ? 'Active Program Angle' : 'Click to Cut/Switch'}) — Hotkey [${tile.angleIndex + 1}]`}
            className={`group relative flex flex-col items-center justify-center overflow-hidden rounded-md cursor-pointer transition-all duration-150 ${
              tile.isOnAir
                ? 'ring-2 ring-red-500 shadow-[0_0_16px_rgba(239,68,68,0.55)] z-10'
                : 'border border-hairline/60 hover:ring-2 hover:ring-emerald-400 hover:shadow-[0_0_12px_rgba(52,211,153,0.45)] hover:border-transparent opacity-85 hover:opacity-100'
            }`}
          >
            {/* Background Video / Media Element */}
            {angleMediaUrl ? (
              <video
                ref={(node) => {
                  videoRefs.current[tile.angleIndex] = node;
                }}
                src={angleMediaUrl}
                playsInline
                preload="auto"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-text-disabled">
                <span className="material-symbols-outlined text-4xl opacity-40">videocam_off</span>
              </div>
            )}

            {/* Subtle Gradient Vignette for readable overlays */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60" />

            {/* Top HUD Bar: Angle Badge & Tally Indicator */}
            <div className="pointer-events-none absolute top-0 inset-x-0 flex items-center justify-between p-2 text-white">
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-colors ${
                    tile.isOnAir
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-black/60 text-zinc-300 group-hover:bg-emerald-600/90 group-hover:text-white'
                  }`}
                >
                  {tile.isOnAir ? (
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  ) : null}
                  <span>{tile.isOnAir ? 'Program' : `Angle ${tile.angleIndex + 1}`}</span>
                </span>
                <span className="text-[11px] font-semibold drop-shadow-md truncate max-w-[130px]">
                  {tile.angle.cameraLabel}
                </span>
              </div>

              {/* Hotkey Badge */}
              <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-300 border border-white/20 backdrop-blur-sm">
                [{tile.angleIndex + 1}]
              </span>
            </div>

            {/* Bottom HUD Bar: Timecode & Sync Offset */}
            <div className="pointer-events-none absolute bottom-0 inset-x-0 flex items-center justify-between p-2 text-white text-[10px] font-mono">
              <span className="rounded bg-black/60 px-1 py-0.5 text-zinc-300 backdrop-blur-sm">
                {tile.angle.syncOffsetFrames !== 0 ? (
                  <span className="text-amber-400">
                    Sync: {tile.angle.syncOffsetFrames > 0 ? `+${tile.angle.syncOffsetFrames}f` : `${tile.angle.syncOffsetFrames}f`}
                  </span>
                ) : (
                  <span className="text-zinc-400">Sync: 0f</span>
                )}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-semibold backdrop-blur-sm ${
                  tile.isOnAir ? 'bg-red-950/80 text-red-200 border border-red-500/40' : 'bg-black/60 text-zinc-200'
                }`}
              >
                {tile.timecode}
              </span>
            </div>

            {/* Cut-on-hover indicator badge */}
            {!tile.isOnAir && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-950/30">
                <span className="rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-bold text-black shadow-lg flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">content_cut</span>
                  <span>{playing ? `Cut to Angle ${tile.angleIndex + 1}` : `Switch to Angle ${tile.angleIndex + 1}`}</span>
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
