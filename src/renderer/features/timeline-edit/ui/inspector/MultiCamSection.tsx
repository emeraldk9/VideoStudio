import {
  DEFAULT_MULTICAM_SETTINGS,
  switchActiveAngle,
  type MultiCamClipSettings,
  type MultiCamSyncMethod,
  type SequenceClip,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';

export interface MultiCamSectionProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

export function MultiCamSection({ clip, patchClip }: MultiCamSectionProps) {
  const multiCam = clip.effects?.multiCam ?? DEFAULT_MULTICAM_SETTINGS;

  const patchMultiCam = (patch: Partial<MultiCamClipSettings>) => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        multiCam: {
          ...multiCam,
          ...patch,
        },
      },
    });
  };

  const handleAngleClick = (index: number) => {
    const updated = switchActiveAngle(multiCam, index);
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        multiCam: updated,
      },
    });
  };

  return (
    <Section title="Multi-Camera Angle Switcher (MultiCam)">
      <div className="flex flex-col gap-3 text-xs">
        {/* Master Switch & Reset */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={multiCam.enabled}
              onChange={(e) => patchMultiCam({ enabled: e.target.checked })}
              className="accent-indigo-500"
            />
            <span className="font-semibold text-text-primary">Enable MultiCam Asset</span>
          </label>
          {clip.effects?.multiCam ? (
            <button
              type="button"
              onClick={() =>
                patchClip(clip.id, {
                  effects: { ...clip.effects, multiCam: undefined },
                })
              }
              className="text-[10px] text-text-disabled hover:text-text-primary transition-colors"
            >
              Reset
            </button>
          ) : null}
        </div>

        <div
          className={`flex flex-col gap-2.5 transition-opacity ${
            multiCam.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
          }`}
        >
          {/* Multi-Angle Matrix Grid (2x2) */}
          <div className="flex flex-col gap-1">
            <span className="text-text-disabled text-[11px] font-medium">
              Camera Angle Switching
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {multiCam.angles.map((angle, idx) => {
                const isActive = multiCam.enabled && multiCam.activeAngleIndex === idx;
                return (
                  <button
                    key={angle.id}
                    type="button"
                    onClick={() => handleAngleClick(idx)}
                    className={`p-2 rounded flex flex-col items-start gap-1 border transition-all text-left ${
                      isActive
                        ? 'bg-indigo-600/30 border-indigo-500 text-text-primary shadow-sm ring-1 ring-indigo-500/50'
                        : 'bg-surface-raised border-hairline text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-surface/60 border border-hairline/40">
                        {angle.name}
                      </span>
                      {isActive ? (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      ) : null}
                    </div>
                    <span className="font-semibold text-[11px] truncate w-full text-text-primary">
                      {angle.cameraLabel}
                    </span>
                    <div className="flex items-center justify-between w-full text-[9px] text-text-disabled font-mono pt-0.5">
                      <span>Offset:</span>
                      <span className={angle.syncOffsetFrames !== 0 ? 'text-amber-400' : ''}>
                        {angle.syncOffsetFrames > 0
                          ? `+${angle.syncOffsetFrames}f`
                          : `${angle.syncOffsetFrames}f`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sync Method Dropdown */}
          <label className="flex items-center gap-2 text-text-secondary text-[11px] pt-1 border-t border-hairline/40">
            <span className="w-24 shrink-0 text-text-disabled">Sync Source</span>
            <select
              value={multiCam.syncMethod}
              onChange={(e) =>
                patchMultiCam({ syncMethod: e.target.value as MultiCamSyncMethod })
              }
              className="flex-1 px-2 py-1 rounded bg-surface-raised border border-hairline text-text-primary text-[11px] outline-none"
            >
              <option value="audio_waveform">Audio Waveform (Cross-Correlation)</option>
              <option value="in_point">First In-Point Frame</option>
              <option value="timecode">Source Timecode (SMPTE)</option>
            </select>
          </label>

          {/* Audio Follows Video Toggle */}
          <label className="flex items-center gap-2 text-text-secondary cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={multiCam.audioFollowsVideo}
              onChange={(e) => patchMultiCam({ audioFollowsVideo: e.target.checked })}
              className="accent-indigo-500"
            />
            <div className="flex flex-col">
              <span className="text-text-primary text-[11px] font-medium">
                Audio Follows Video
              </span>
              <span className="text-text-disabled text-[9px]">
                Switch audio channel alongside active camera angle
              </span>
            </div>
          </label>
        </div>
      </div>
    </Section>
  );
}
