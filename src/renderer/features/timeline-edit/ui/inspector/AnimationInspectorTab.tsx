import { useState, type ReactNode } from 'react';
import {
  keyframesFor,
  valueAtFrame,
  type KeyframeProperty,
  type SequenceClip,
} from '@shared';
import { Button } from '../../../../shared/ui/Button';
import { Section } from '../../../../shared/ui/Section';
import { KeyframeCurveEditor } from '../KeyframeCurveEditor';

export interface AnimationInspectorTabProps {
  clip: SequenceClip;
  fps: number;
  overlay: boolean;
  carriesSound: boolean;
  animationProperties: KeyframeProperty[];
  clipRelativePlayhead: () => number;
  addKeyframe: (property: KeyframeProperty, value: number) => void;
  keyframeRows: (property: KeyframeProperty, format: (value: number) => string) => ReactNode;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

export function AnimationInspectorTab({
  clip,
  fps,
  overlay,
  carriesSound,
  animationProperties,
  clipRelativePlayhead,
  addKeyframe,
  keyframeRows,
  patchClip,
}: AnimationInspectorTabProps) {
  const [animationViewMode, setAnimationViewMode] = useState<'graph' | 'list'>('graph');

  return (
    <Section title="Curves & Animation">
      {animationProperties.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-secondary">Keyframe Curves</span>
            <div className="flex items-center gap-1 bg-bg-app rounded p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setAnimationViewMode('graph')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  animationViewMode === 'graph'
                    ? 'bg-accent-primary text-text-inverse'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Graph View
              </button>
              <button
                type="button"
                onClick={() => setAnimationViewMode('list')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  animationViewMode === 'list'
                    ? 'bg-accent-primary text-text-inverse'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                List View
              </button>
            </div>
          </div>

          {animationViewMode === 'graph' ? (
            <KeyframeCurveEditor
              clip={clip}
              fps={fps}
              availableProperties={animationProperties}
              clipRelativePlayheadFrame={clipRelativePlayhead()}
              onUpdateKeyframes={(next) => patchClip(clip.id, { keyframes: next })}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {overlay && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect' ? (
                <>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Position (X / Y)</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const frame = clipRelativePlayhead();
                          addKeyframe(
                            'x',
                            valueAtFrame(
                              clip.keyframes,
                              'x',
                              frame,
                              clip.effects?.transform?.x ?? 0.5,
                            ),
                          );
                          addKeyframe(
                            'y',
                            valueAtFrame(
                              clip.keyframes,
                              'y',
                              frame,
                              clip.effects?.transform?.y ?? 0.5,
                            ),
                          );
                        }}
                      >
                        + Add Position Key
                      </Button>
                    </div>
                    {keyframesFor(clip.keyframes, 'x').length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {keyframeRows('x', (value) => `x ${(value * 100).toFixed(0)}%`)}
                        {keyframeRows('y', (value) => `y ${(value * 100).toFixed(0)}%`)}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-disabled">No position keyframes recorded.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Scale</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const frame = clipRelativePlayhead();
                          addKeyframe(
                            'scale',
                            valueAtFrame(
                              clip.keyframes,
                              'scale',
                              frame,
                              clip.effects?.transform?.scale ?? 1,
                            ),
                          );
                        }}
                      >
                        + Add Scale Key
                      </Button>
                    </div>
                    {keyframesFor(clip.keyframes, 'scale').length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {keyframeRows('scale', (value) => `${value.toFixed(2)}x`)}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-disabled">No scale keyframes recorded.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Opacity</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const frame = clipRelativePlayhead();
                          addKeyframe(
                            'opacity',
                            valueAtFrame(
                              clip.keyframes,
                              'opacity',
                              frame,
                              clip.effects?.transform?.opacity ?? 1,
                            ),
                          );
                        }}
                      >
                        + Add Opacity Key
                      </Button>
                    </div>
                    {keyframesFor(clip.keyframes, 'opacity').length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {keyframeRows('opacity', (value) => `${(value * 100).toFixed(0)}%`)}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-disabled">No opacity keyframes recorded.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Rotation</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const frame = clipRelativePlayhead();
                          addKeyframe(
                            'rotation',
                            valueAtFrame(
                              clip.keyframes,
                              'rotation',
                              frame,
                              clip.effects?.transform?.rotation ?? 0,
                            ),
                          );
                        }}
                      >
                        + Add Rotation Key
                      </Button>
                    </div>
                    {keyframesFor(clip.keyframes, 'rotation').length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {keyframeRows('rotation', (value) => `${value.toFixed(0)}°`)}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-disabled">No rotation keyframes recorded.</p>
                    )}
                  </div>
                </>
              ) : null}

              {carriesSound ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary font-medium">Volume (dB)</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        addKeyframe(
                          'volume',
                          valueAtFrame(clip.keyframes, 'volume', clipRelativePlayhead(), clip.gainDb),
                        )
                      }
                    >
                      + Add Volume Key
                    </Button>
                  </div>
                  {keyframesFor(clip.keyframes, 'volume').length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {keyframeRows(
                        'volume',
                        (value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} dB`,
                      )}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-disabled">No volume keyframes recorded.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-disabled">
          This clip has no animatable properties. Overlay clips and audio tracks support position,
          scale, opacity, rotation, and volume curve animation.
        </p>
      )}
    </Section>
  );
}
