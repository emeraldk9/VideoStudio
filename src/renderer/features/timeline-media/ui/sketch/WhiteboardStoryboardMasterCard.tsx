import type {
  WhiteboardSettings,
  SequenceClip,
  StoryboardPackageOptions,
} from '@shared';
import { Button } from '../../../../shared/ui/Button';

export interface WhiteboardStoryboardMasterCardProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
  targetClip: SequenceClip | null;
  fps: number;
  durationFrames: number;
}

export function WhiteboardStoryboardMasterCard({
  activeSettings,
  updateSettings,
  targetClip,
  fps,
  durationFrames,
}: WhiteboardStoryboardMasterCardProps) {
  const handleExportStoryboard = () => {
    const sceneId = targetClip?.id || 'scene_01';
    const pkg: StoryboardPackageOptions = {
      packageId: `package_${Date.now()}`,
      title: targetClip?.label || 'Whiteboard Presentation',
      fps,
      scenes: [
        {
          sceneId,
          title: targetClip?.label || 'Main Scene',
          imagePath: targetClip?.filePath || '',
          durationSec: durationFrames / fps,
          handStylus: activeSettings.hand,
          drawFraction: activeSettings.drawFraction ?? 0.80,
          eraseOut: activeSettings.eraseOut ?? false,
          erasePattern: activeSettings.erasePattern ?? 'zigzag',
          eraseFraction: activeSettings.eraseFraction ?? 0.20,
          foleyEnabled: activeSettings.foleyEnabled ?? true,
          foleyVolume: activeSettings.foleyVolume ?? 0.60,
        },
      ],
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${targetClip?.label || 'storyboard'}.storyboard.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-card border border-hairline bg-bg-app/40 p-2.5 flex flex-col gap-2">
      {/* Milestone S99: Storyboard Sequence Packaging & Export */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-text-secondary uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-accent-ai">auto_stories</span>
          <span>Storyboard Packaging</span>
        </span>
        <span className="text-[10px] text-text-disabled">Multi-Scene Sequence</span>
      </div>
      <p className="text-[11px] text-text-disabled leading-relaxed">
        Export current clip and scene settings as a multi-scene whiteboard storyboard package for Python batch rendering or cross-project timeline assembly.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="flex items-center justify-center gap-1.5 text-xs font-medium"
        onClick={handleExportStoryboard}
      >
        <span className="material-symbols-outlined text-[15px] text-accent-ai">file_download</span>
        <span>Export Storyboard Project JSON</span>
      </Button>

      {/* Milestone S140: Multi-Track Storyboard Master Mixdown & 4K ProRes/H.265 Export */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline mt-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-text-secondary flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-accent-ai">movie_creation</span>
            Master Delivery Encoding & Foley Mixdown
          </span>
          <span className="text-[10px] text-text-disabled">EBU R128 (-23 LUFS)</span>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          {(['prores_422_hq', 'hevc_4k', 'h264_web'] as const).map((fmt) => {
            const active = (activeSettings.storyboardMasterExport?.preset ?? 'prores_422_hq') === fmt;
            const label =
              fmt === 'prores_422_hq'
                ? 'ProRes 422 4K'
                : fmt === 'hevc_4k'
                  ? 'HEVC 4K'
                  : 'H.264 Web';
            return (
              <button
                key={fmt}
                type="button"
                onClick={() =>
                  updateSettings({
                    ...activeSettings,
                    storyboardMasterExport: {
                      ...activeSettings.storyboardMasterExport,
                      preset: fmt,
                    },
                  })
                }
                className={`flex-1 py-1 px-1.5 text-[10px] rounded border transition-colors ${
                  active
                    ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                    : 'border-hairline text-text-secondary hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] pt-1">
          <span className="text-text-secondary">Loudness Target</span>
          <div className="flex items-center gap-1 text-[10px]">
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  ...activeSettings,
                  storyboardMasterExport: {
                    ...activeSettings.storyboardMasterExport,
                    ebuTargetLufs: -23.0,
                  },
                })
              }
              className={`px-1.5 py-0.5 rounded ${
                (activeSettings.storyboardMasterExport?.ebuTargetLufs ?? -23.0) === -23.0
                  ? 'bg-accent-ai/25 text-accent-ai font-semibold'
                  : 'text-text-disabled hover:text-text-secondary'
              }`}
            >
              -23 LUFS (Broadcast)
            </button>
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  ...activeSettings,
                  storyboardMasterExport: {
                    ...activeSettings.storyboardMasterExport,
                    ebuTargetLufs: -14.0,
                  },
                })
              }
              className={`px-1.5 py-0.5 rounded ${
                activeSettings.storyboardMasterExport?.ebuTargetLufs === -14.0
                  ? 'bg-accent-ai/25 text-accent-ai font-semibold'
                  : 'text-text-disabled hover:text-text-secondary'
              }`}
            >
              -14 LUFS (Web)
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-text-secondary">Speech Narration Ducking</span>
          <span className="font-mono text-text-primary text-[10px]">
            {activeSettings.storyboardMasterExport?.speechDuckingAttenuationDb ?? -9} dB
          </span>
        </div>
        <input
          type="range"
          min={-24}
          max={0}
          step={1}
          value={activeSettings.storyboardMasterExport?.speechDuckingAttenuationDb ?? -9}
          aria-label="Speech narration foley ducking attenuation in decibels"
          className="w-full accent-[var(--accent-ai)] cursor-pointer"
          onChange={(e) =>
            updateSettings({
              ...activeSettings,
              storyboardMasterExport: {
                ...activeSettings.storyboardMasterExport,
                speechDuckingAttenuationDb: Number(e.target.value),
              },
            })
          }
        />
      </div>
    </div>
  );
}
