import { useState, useMemo, type ReactNode } from 'react';
import {
  keyframesFor,
  valueAtFrame,
  type KeyframeProperty,
  type SequenceClip,
  extractSpatialWaypoints,
  buildMotionPathSegments,
  calculateMotionVelocity,
  smoothKeyframeTangents,
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

  const waypoints = useMemo(() => {
    if (!clip.keyframes || clip.keyframes.length === 0) return [];
    return extractSpatialWaypoints(
      clip.keyframes,
      clip.effects?.transform?.x ?? 0.5,
      clip.effects?.transform?.y ?? 0.5,
    );
  }, [clip.keyframes, clip.effects?.transform?.x, clip.effects?.transform?.y]);

  const motionSegments = useMemo(() => {
    if (waypoints.length < 2) return [];
    return buildMotionPathSegments(waypoints);
  }, [waypoints]);

  const currentPlayheadFrame = clipRelativePlayhead();

  const liveVelocity = useMemo(() => {
    if (motionSegments.length === 0) return null;
    return calculateMotionVelocity(motionSegments, currentPlayheadFrame, fps, 1920, 1080);
  }, [motionSegments, currentPlayheadFrame, fps]);

  const totalPathDistancePx = useMemo(() => {
    return motionSegments.reduce((acc, seg) => acc + seg.arcLength, 0);
  }, [motionSegments]);

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

          {/* S185: Spatial Spline Dynamics Card */}
          {waypoints.length >= 2 && (
            <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-app p-2.5 mt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-accent-ai">gesture</span>
                  <span className="text-xs font-semibold text-text-primary">Spatial Spline Dynamics</span>
                </div>
                <span className="text-[10px] font-mono text-accent-ai bg-accent-ai/10 px-1.5 py-0.5 rounded border border-accent-ai/30">
                  {waypoints.length} waypoints · {Math.round(totalPathDistancePx)}px
                </span>
              </div>

              {liveVelocity && (
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-bg-panel p-2 rounded border border-hairline">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-disabled uppercase">Instant Speed</span>
                    <span className="text-text-primary font-bold">{Math.round(liveVelocity.speed)} px/s</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-disabled uppercase">Auto-Orient Heading</span>
                    <span className="text-accent-ai font-bold">{Math.round(liveVelocity.headingDeg)}°</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs flex-1"
                  onClick={() => {
                    const smoothed = smoothKeyframeTangents(clip.keyframes);
                    patchClip(clip.id, { keyframes: smoothed });
                  }}
                >
                  <span className="material-symbols-outlined text-[13px] mr-1">auto_fix_high</span>
                  Smooth Spline Tangents
                </Button>
              </div>
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
