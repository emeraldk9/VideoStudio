import {
  resolveWhiteboardDrawSeconds,
  resolveWhiteboardInSeconds,
  resolveWhiteboardInFrame,
  resolveWhiteboardOutFrame,
  whiteboardEffectiveDrawFraction,
  whiteboardEffectiveInFraction,
  type WhiteboardSettings,
  type SequenceClip,
} from '@shared';
import { Button } from '../../../../shared/ui/Button';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';

export interface Card2TimingKeyframesProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
  targetClip: SequenceClip | null;
  durationFrames: number;
  fps: number;
  handleSyncToAudio: () => void;
  isSyncingAudio: boolean;
}

export function Card2TimingKeyframes({
  activeSettings,
  updateSettings,
  targetClip,
  durationFrames,
  fps,
  handleSyncToAudio,
  isSyncingAudio,
}: Card2TimingKeyframesProps) {
  const inSec = resolveWhiteboardInSeconds(activeSettings, durationFrames, fps);
  const inPct = Math.round(
    whiteboardEffectiveInFraction(activeSettings, durationFrames, fps) * 100,
  );
  const inFrame = resolveWhiteboardInFrame(activeSettings, durationFrames, fps);

  const drawSec = resolveWhiteboardDrawSeconds(activeSettings, durationFrames, fps);
  const drawPct = Math.round(
    whiteboardEffectiveDrawFraction(activeSettings, durationFrames, fps) * 100,
  );
  const outFrame = resolveWhiteboardOutFrame(activeSettings, durationFrames, fps);

  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Timing & Keyframes
      </span>

      {/* Keyframe In (Start Point) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 text-text-secondary">
            <span className="text-accent-warning">◆</span> Keyframe In (Start Delay)
          </span>
          <span className="font-mono text-text-primary text-[11px]">
            {inSec.toFixed(2)}s ({inPct}%) • {inFrame}f
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, (activeSettings.drawFraction ?? 0.85) - 0.05)}
          step={0.02}
          value={whiteboardEffectiveInFraction(activeSettings, durationFrames, fps)}
          aria-label="Sketch In Keyframe"
          className="w-full accent-[var(--accent-warning)] cursor-pointer"
          onChange={(event) => {
            const next = { ...activeSettings, inFraction: Number(event.target.value) };
            delete next.inSeconds;
            updateSettings(next);
          }}
        />
      </div>

      {/* Keyframe Out (End Point) */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 text-text-secondary">
            <span className="text-accent-ai">◆</span> Keyframe Out (Draw Complete)
          </span>
          <span className="font-mono text-text-primary text-[11px]">
            {drawSec.toFixed(2)}s ({drawPct}%) • {outFrame}f
          </span>
        </div>
        <input
          type="range"
          min={Math.min(1, (activeSettings.inFraction ?? 0) + 0.05)}
          max={1}
          step={0.02}
          value={whiteboardEffectiveDrawFraction(activeSettings, durationFrames, fps)}
          aria-label="Sketch Out Keyframe"
          className="w-full accent-[var(--accent-ai)] cursor-pointer"
          onChange={(event) => {
            const next = { ...activeSettings, drawFraction: Number(event.target.value) };
            delete next.drawSeconds;
            updateSettings(next);
          }}
        />
      </div>

      {/* Animation Cadence */}
      <div className="flex items-center justify-between pt-2 border-t border-hairline">
        <div className="flex flex-col">
          <span className="text-[11px] text-text-secondary">Animation Cadence</span>
          <span className="text-[10px] text-text-disabled">
            {activeSettings.cadenceFps ? 'Hand-drawn (12 fps)' : 'Fluid (full frame rate)'}
          </span>
        </div>
        <SegmentedControl
          value={activeSettings.cadenceFps ? '12' : 'smooth'}
          onChange={(value) => {
            const next = { ...activeSettings };
            if (value === 'smooth') {
              delete next.cadenceFps;
            } else {
              next.cadenceFps = 12;
            }
            updateSettings(next);
          }}
          options={[
            { value: 'smooth', label: 'Fluid' },
            { value: '12', label: 'Hand-Drawn' },
          ]}
          ariaLabel="Draw cadence"
        />
      </div>

      {/* Speech Cadence Auto-Sync */}
      <div className="flex items-center justify-between pt-2 border-t border-hairline">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-accent-ai">graphic_eq</span>
            Speech Cadence Sync
          </span>
          <span className="text-[10px] text-text-disabled">
            Align keyframes & zone weights to voiceover audio
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={isSyncingAudio || !targetClip}
          className="flex items-center gap-1 px-2.5 text-[11px] font-semibold"
          onClick={handleSyncToAudio}
          title="Scan overlapping narration audio and snap drawing timeline to speech boundaries"
        >
          <span className={`material-symbols-outlined text-[14px] text-accent-ai ${isSyncingAudio ? 'animate-spin' : ''}`}>
            {isSyncingAudio ? 'sync' : 'auto_fix_high'}
          </span>
          <span>{isSyncingAudio ? 'Syncing…' : 'Auto-Align'}</span>
        </Button>
      </div>

      {/* Milestone S93: Board Clearing / Erase Out Transition */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">cleaning_services</span>
              Erase Out (Board Clearing)
            </span>
            <span className="text-[10px] text-text-disabled">
              Actively scrub board clean before next clip
            </span>
          </div>
          <Switch
            checked={activeSettings.eraseOut === true}
            label="Erase Out toggle"
            onChange={() => {
              const next = { ...activeSettings, eraseOut: !activeSettings.eraseOut };
              updateSettings(next);
            }}
          />
        </div>

        {activeSettings.eraseOut && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Erase Duration</span>
              <span className="font-mono text-text-primary text-[10px]">
                {((activeSettings.eraseFraction ?? 0.20) * 100).toFixed(0)}% ({(((activeSettings.eraseFraction ?? 0.20) * durationFrames) / fps).toFixed(2)}s)
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.40}
              step={0.05}
              value={activeSettings.eraseFraction ?? 0.20}
              aria-label="Erase Out Fraction"
              className="w-full accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({ ...activeSettings, eraseFraction: Number(e.target.value) })
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-text-secondary">Erase Style</span>
              <SegmentedControl
                value={activeSettings.erasePattern ?? 'zigzag'}
                onChange={(pattern) =>
                  updateSettings({ ...activeSettings, erasePattern: pattern as 'zigzag' | 'wipe' })
                }
                options={[
                  { value: 'zigzag', label: 'Zigzag Scrub' },
                  { value: 'wipe', label: 'Linear Wipe' },
                ]}
                ariaLabel="Erase pattern style"
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
