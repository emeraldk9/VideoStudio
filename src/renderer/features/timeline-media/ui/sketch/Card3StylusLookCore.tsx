import type { WhiteboardSettings } from '@shared';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';
import { WhiteboardFoleyEngine } from '../../lib/whiteboard-foley';

export interface Card3StylusLookCoreProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
}

export function Card3StylusLookCore({
  activeSettings,
  updateSettings,
}: Card3StylusLookCoreProps) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
        Stylus & Board Look
      </span>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-secondary">Hand Stylus</span>
        <SegmentedControl
          value={activeSettings.hand}
          onChange={(hand) => updateSettings({ ...activeSettings, hand })}
          options={[
            { value: 'pen', label: 'Pen' },
            { value: 'marker', label: 'Marker' },
            { value: 'pencil', label: 'Pencil' },
            { value: 'chalk', label: 'Chalk' },
            { value: 'none', label: 'None' },
          ]}
          ariaLabel="Hand style"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-hairline">
        <span className="text-[11px] text-text-secondary">Artistic Look</span>
        <SegmentedControl
          value={activeSettings.look}
          onChange={(look) => updateSettings({ ...activeSettings, look })}
          options={[
            { value: 'none', label: 'Original' },
            { value: 'sketch', label: 'Sketch' },
            { value: 'pencil', label: 'Pencil' },
            { value: 'comic', label: 'Comic' },
          ]}
          ariaLabel="Board look"
        />
      </div>

      {/* Milestone S97: Dynamic Calligraphy & Variable-Width Brush */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">brush</span>
              Calligraphy & Brush Dynamics
            </span>
            <span className="text-[10px] text-text-disabled">
              Speed pressure tapering & anisotropic chisel nib
            </span>
          </div>
          <Switch
            checked={activeSettings.brushDynamics?.taper ?? true}
            onChange={() => {
              const currentTaper = activeSettings.brushDynamics?.taper ?? true;
              updateSettings({
                ...activeSettings,
                brushDynamics: {
                  ...activeSettings.brushDynamics,
                  taper: !currentTaper,
                },
              });
            }}
            label="Toggle stroke tapering"
          />
        </div>

        {(activeSettings.brushDynamics?.taper ?? true) && (
          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-secondary">Chisel-Tip Nib</span>
              <Switch
                checked={activeSettings.brushDynamics?.chiselNib ?? false}
                onChange={() => {
                  const currentChisel = activeSettings.brushDynamics?.chiselNib ?? false;
                  updateSettings({
                    ...activeSettings,
                    brushDynamics: {
                      ...activeSettings.brushDynamics,
                      chiselNib: !currentChisel,
                    },
                  });
                }}
                label="Toggle chisel nib"
              />
            </div>

            {activeSettings.brushDynamics?.chiselNib && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Nib Angle</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-text-primary text-[10px]">
                    {activeSettings.brushDynamics?.nibAngleDeg ?? 45}°
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    step={15}
                    value={activeSettings.brushDynamics?.nibAngleDeg ?? 45}
                    aria-label="Chisel Nib Angle"
                    className="w-20 accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        brushDynamics: {
                          ...activeSettings.brushDynamics,
                          nibAngleDeg: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawing Foley Audio SFX */}
      <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">volume_up</span>
              Drawing Foley SFX
            </span>
            <span className="text-[10px] text-text-disabled">
              Contact scratch & friction sound synchronized to pen movement
            </span>
          </div>
          <Switch
            checked={activeSettings.foleyEnabled ?? true}
            onChange={() =>
              updateSettings({
                ...activeSettings,
                foleyEnabled: !(activeSettings.foleyEnabled ?? true),
              })
            }
            label="Toggle whiteboard foley audio"
          />
        </div>

        {(activeSettings.foleyEnabled ?? true) && (
          <div className="flex items-center gap-2 pl-1 pt-1">
            <span className="text-[10px] text-text-disabled w-12 shrink-0">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={activeSettings.foleyVolume ?? 0.6}
              aria-label="Foley volume"
              className="flex-1 accent-[var(--accent-ai)] cursor-pointer"
              onChange={(e) =>
                updateSettings({ ...activeSettings, foleyVolume: Number(e.target.value) })
              }
            />
            <span className="font-mono text-[10px] text-text-secondary w-8 text-right">
              {Math.round((activeSettings.foleyVolume ?? 0.6) * 100)}%
            </span>
            <button
              type="button"
              title="Test Foley Audio Sample"
              className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-bg-hover hover:text-accent-ai transition-colors"
              onClick={() => {
                WhiteboardFoleyEngine.getInstance().previewSample(
                  activeSettings.hand,
                  0.7,
                  activeSettings.foleyVolume ?? 0.6,
                );
              }}
            >
              <span className="material-symbols-outlined text-[13px]">play_circle</span>
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
