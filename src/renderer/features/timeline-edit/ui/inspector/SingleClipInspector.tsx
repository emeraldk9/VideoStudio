import React, { useEffect, useMemo, useState } from 'react';
import {
  CLIP_COLOR_LABELS,
  COLOR_LABEL_DEFINITIONS,
  formatDurationSeconds,
  formatTimecode,
  framesToSeconds,
  secondsToFrames,
  slipClipMedia,
  keyframesFor,
  layoutTrack,
  type ClipKeyframe,
  type KeyframeProperty,
  type ClipOverridableField,
  isCompoundClip,
  getCompoundClipMetadata,
  type SequenceClip,
  type SequenceDocument,
} from '@shared';
import {
  currentPlayheadFrame,
  useSequenceStore,
} from '../../../../entities/sequence';
import { Button } from '../../../../shared/ui/Button';
import { InlineEditableText } from '../../../../shared/ui/InlineEditableText';
import { Section } from '../../../../shared/ui/Section';
import { ColorGradingPanel } from '../ColorGradingPanel';
import { VideoEffectInspectorPanel } from '../VideoEffectInspectorPanel';
import { TextInspectorTab } from './TextInspectorTab';
import { SpeedInspectorTab } from './SpeedInspectorTab';
import { VideoInspectorTab } from './VideoInspectorTab';
import { AnimationInspectorTab } from './AnimationInspectorTab';
import { MotionInspectorTab } from './MotionInspectorTab';
import { AudioInspectorTab } from './AudioInspectorTab';
import { TransitionInspectorTab } from './TransitionInspectorTab';

export interface SingleClipInspectorProps {
  clip: SequenceClip;
  document: SequenceDocument;
  fps: number;
  patchClip: (
    clipId: string,
    patch: Partial<SequenceClip>,
    overridableField?: ClipOverridableField,
  ) => void;
}

export const SingleClipInspector = React.memo(function SingleClipInspector({
  clip,
  document,
  fps,
  patchClip,
}: SingleClipInspectorProps) {
  const stepIntoCompoundClip = useSequenceStore((state) => state.stepIntoCompoundClip);
  const decomposeCompoundClip = useSequenceStore((state) => state.decomposeCompoundClip);
  /**
   * S181 — does the selected video clip's file actually carry sound?
   * `null` while unknown, so the controls render optimistically rather than
   * flashing "no audio track" at every selection.
   */
  const [probed, setProbed] = useState<{ path: string; hasAudio: boolean } | null>(null);
  const probePath = clip.sourceKind === 'video' ? clip.filePath : null;
  const sourceHasAudio = probed?.path === probePath ? (probed?.hasAudio ?? null) : null;

  useEffect(() => {
    if (!probePath) return;
    let cancelled = false;
    void window.api.sequence
      .probeSources([probePath])
      .then((probes) => {
        if (cancelled) return;
        setProbed({ path: probePath, hasAudio: probes?.[probePath]?.hasAudio ?? true });
      })
      .catch((err) => {
        console.warn('[ClipInspector] probeSources failed:', probePath, err);
        if (cancelled) return;
        setProbed({ path: probePath, hasAudio: true });
      });
    return () => {
      cancelled = true;
    };
  }, [probePath]);

  const clipTrack = document.tracks.find((track) => track.id === clip.trackId);
  const audio = clipTrack?.kind === 'audio';
  const videoClip = clip.sourceKind === 'video';
  const carriesSound = audio || videoClip;
  const overlay =
    clipTrack?.kind === 'video' && clip.trackId !== document.sequence.spineTrackId;

  const clipRelativePlayhead = (): number => {
    if (!clipTrack) return 0;
    const placed = layoutTrack(document.clips, clipTrack).find((item) => item.clip.id === clip.id);
    if (!placed) return 0;
    return Math.max(0, Math.min(clip.durationFrames - 1, currentPlayheadFrame() - placed.startFrames));
  };

  const addKeyframe = (property: KeyframeProperty, value: number) => {
    const frame = clipRelativePlayhead();
    const next: ClipKeyframe[] = [
      ...(clip.keyframes ?? []).filter(
        (keyframe) => !(keyframe.property === property && keyframe.frame === frame),
      ),
      { property, frame, value, interpolation: 'linear' },
    ];
    patchClip(clip.id, { keyframes: next });
  };

  const removeKeyframe = (property: KeyframeProperty, frame: number) => {
    const next = (clip.keyframes ?? []).filter(
      (keyframe) => !(keyframe.property === property && keyframe.frame === frame),
    );
    patchClip(clip.id, { keyframes: next.length > 0 ? next : undefined });
  };

  const keyframeRows = (property: KeyframeProperty, format: (value: number) => string) =>
    keyframesFor(clip.keyframes, property).map((keyframe) => (
      <li
        key={`${property}-${keyframe.frame}`}
        className="flex items-center gap-2 font-mono text-xs text-text-secondary"
      >
        <span className="w-14">{framesToSeconds(keyframe.frame, fps).toFixed(2)}s</span>
        <span className="flex-1">{format(keyframe.value)}</span>
        <span className="text-[10px] uppercase font-sans text-accent-primary bg-bg-app px-1.5 py-0.5 rounded border border-hairline">
          {keyframe.interpolation}
        </span>
        <button
          type="button"
          aria-label={`Delete keyframe at ${framesToSeconds(keyframe.frame, fps).toFixed(2)}s`}
          className="text-text-disabled hover:text-text-primary px-1"
          onClick={() => removeKeyframe(property, keyframe.frame)}
        >
          ×
        </button>
      </li>
    ));

  const animationProperties = useMemo(() => {
    const props: KeyframeProperty[] = [];
    if (overlay && clip.sourceKind !== 'text' && clip.sourceKind !== 'effect') {
      props.push('x', 'y', 'scale', 'opacity', 'rotation');
    }
    if (carriesSound) {
      props.push('volume');
    }
    return props;
  }, [overlay, clip.sourceKind, carriesSound]);

  const availableTabs: Array<{ id: string; label: string; icon: string }> = useMemo(() => {
    if (isCompoundClip(clip)) {
      return [
        { id: 'compound', label: 'Compound', icon: 'auto_awesome_motion' },
        { id: 'basic', label: 'Clip', icon: 'crop_free' },
        { id: 'video', label: 'Transform', icon: 'videocam' },
        { id: 'color', label: 'Color', icon: 'palette' },
        { id: 'effect', label: 'Effects', icon: 'auto_fix_high' },
      ];
    }
    if (clip.sourceKind === 'text') {
      const isCaption = clip.effects?.text?.preset === 'caption';
      return [
        {
          id: 'text',
          label: isCaption ? 'Captions' : 'Text',
          icon: isCaption ? 'closed_caption' : 'title',
        },
        { id: 'basic', label: 'Transform', icon: 'crop_free' },
      ];
    }
    if (clip.sourceKind === 'audio') {
      return [
        { id: 'audio', label: 'Audio', icon: 'graphic_eq' },
        { id: 'speed', label: 'Speed', icon: 'speed' },
        { id: 'animation', label: 'Curves', icon: 'show_chart' },
      ];
    }
    if (clip.sourceKind === 'still') {
      return [
        { id: 'basic', label: 'Basic', icon: 'image' },
        { id: 'motion', label: 'Motion', icon: 'motion_mode' },
        { id: 'color', label: 'Color', icon: 'palette' },
        { id: 'transition', label: 'Transition', icon: 'auto_awesome_motion' },
      ];
    }
    if (clip.sourceKind === 'effect') {
      return [
        { id: 'color', label: 'Color & LUTs', icon: 'palette' },
        { id: 'effect', label: 'Effects', icon: 'auto_fix_high' },
        { id: 'video', label: 'Layer & Mask', icon: 'layers' },
        { id: 'basic', label: 'Timing', icon: 'schedule' },
      ];
    }
    return [
      { id: 'video', label: 'Video', icon: 'videocam' },
      ...(carriesSound ? [{ id: 'audio', label: 'Audio', icon: 'graphic_eq' }] : []),
      { id: 'speed', label: 'Speed', icon: 'speed' },
      { id: 'animation', label: 'Animation', icon: 'animation' },
      { id: 'effect', label: 'Effects', icon: 'auto_fix_high' },
      { id: 'color', label: 'Filters', icon: 'palette' },
      { id: 'transition', label: 'Transition', icon: 'auto_awesome_motion' },
    ];
  }, [clip.sourceKind, carriesSound]);

  const [activeTab, setActiveTab] = useState<string>('basic');
  useEffect(() => {
    if (!clip) return;
    const defaultTab =
      isCompoundClip(clip)
        ? 'compound'
        : clip.sourceKind === 'video'
          ? 'video'
          : clip.sourceKind === 'audio'
            ? 'audio'
            : clip.sourceKind === 'text'
              ? 'text'
              : clip.sourceKind === 'effect'
                ? (clip.effects?.videoEffect ? 'effect' : 'color')
                : 'basic';
    setActiveTab((current) => (availableTabs.some((t) => t.id === current) ? current : defaultTab));
  }, [clip.id, clip.sourceKind, clip.effects?.videoEffect, availableTabs]);

  const currentTab = availableTabs.some((t) => t.id === activeTab)
    ? activeTab
    : availableTabs[0]?.id ?? 'basic';

  return (
    <div className="flex flex-col gap-4">
      {/* S3 CapCut-style Sub-Tabs Navigation */}
      <div className="flex shrink-0 items-center gap-1 border-b border-hairline/60 pb-2 select-none overflow-x-auto no-scrollbar">
        {availableTabs.map((tab) => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-button px-2.5 py-1 text-xs font-medium transition-all ${
                active
                  ? 'bg-bg-selected text-text-primary font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span className={`material-symbols-outlined text-[15px] ${active ? 'text-accent-ai' : ''}`}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* S64 Compound Clip Inspector Tab */}
      {currentTab === 'compound' && (
        <div className="flex flex-col gap-4">
          <Section title="Nested Container">
            <div className="flex flex-col gap-3 rounded-card border border-cyan-500/30 bg-cyan-950/20 p-3">
              <div className="flex items-center gap-2 text-cyan-300">
                <span className="material-symbols-outlined text-lg">auto_awesome_motion</span>
                <span className="font-semibold text-sm">Compound Clip</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                This container packages multiple timeline tracks and clips into a single portable unit.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-text-disabled text-[10px] uppercase">Child Clips</span>
                  <span className="font-mono text-text-primary font-bold">
                    {clip.effects?.compound?.childClipCount ?? 0} clips
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-text-disabled text-[10px] uppercase">Tracks</span>
                  <span className="font-mono text-text-primary font-bold">
                    {clip.effects?.compound?.childTrackCount ?? 0} tracks
                  </span>
                </div>
                <div className="flex flex-col col-span-2">
                  <span className="text-text-disabled text-[10px] uppercase">Nested Sequence</span>
                  <span className="font-medium text-text-primary truncate">
                    {clip.effects?.compound?.nestedSequenceName ?? clip.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-hairline/60">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-1.5"
                  onClick={() => void stepIntoCompoundClip(clip)}
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  <span>Open in Timeline</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-1.5"
                  onClick={() => decomposeCompoundClip(clip.id)}
                >
                  <span className="material-symbols-outlined text-[14px]">unfold_more</span>
                  <span>Decompose</span>
                </Button>
              </div>
            </div>
          </Section>
        </div>
      )}

      {(currentTab === 'video' || currentTab === 'basic' || currentTab === 'audio') && (
        <>
          <Section title="Clip">
            <InlineEditableText
              value={clip.label || 'Untitled'}
              label="Clip name"
              className="text-sm text-text-primary"
              inputClassName="text-sm"
              maxLength={200}
              onCommit={(label) => patchClip(clip.id, { label }, 'label')}
            />
            {/* S25 — Studio Clip Color Label Swatches */}
            <div className="flex flex-col gap-1.5 pt-2">
              <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
                Label Color
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CLIP_COLOR_LABELS.map((colorKey) => {
                  const meta = COLOR_LABEL_DEFINITIONS[colorKey];
                  const isSelected = (clip.colorLabel ?? 'default') === colorKey;
                  return (
                    <button
                      key={colorKey}
                      type="button"
                      title={meta.name}
                      onClick={() =>
                        patchClip(clip.id, {
                          colorLabel: colorKey === 'default' ? undefined : colorKey,
                        })
                      }
                      className={`h-5 w-5 rounded-full flex items-center justify-center transition-transform ${
                        meta.dotClass
                      } ${
                        isSelected
                          ? 'ring-2 ring-accent-ai ring-offset-2 ring-offset-bg-workspace scale-110 shadow-sm'
                          : 'hover:scale-110 opacity-75 hover:opacity-100'
                      }`}
                    >
                      {isSelected ? (
                        <span className="material-symbols-outlined text-white text-[12px] font-bold">
                          check
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="Duration">
            <div className="flex items-center gap-2">
              <InlineEditableText
                value={framesToSeconds(clip.durationFrames, fps).toFixed(1)}
                label="Duration in seconds"
                className="font-mono text-sm text-text-primary"
                inputClassName="font-mono text-sm w-20"
                maxLength={6}
                onCommit={(next) => {
                  const seconds = Number.parseFloat(next);
                  if (!Number.isFinite(seconds) || seconds <= 0) return;
                  patchClip(
                    clip.id,
                    { durationFrames: Math.max(1, secondsToFrames(seconds, fps)) },
                    'durationFrames',
                  );
                }}
              />
              <span className="font-mono text-xs text-text-disabled">
                {formatDurationSeconds(clip.durationFrames, fps)} · {clip.durationFrames}f
              </span>
            </div>
            {clip.overrides?.includes('durationFrames') ? (
              <p className="text-xs text-text-disabled">
                Changed by hand — a storyboard re-sync will leave this alone.
              </p>
            ) : null}
          </Section>

          {/* S19 — Media Slip & In/Out Controls */}
          {(clip.sourceKind === 'video' || clip.sourceKind === 'audio') && clip.filePath ? (
            <Section title="Media Slip & In/Out">
              <div className="flex flex-col gap-2 rounded-card border border-hairline/80 bg-bg-app p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Source In</span>
                  <span className="font-mono text-text-primary font-bold">
                    {formatTimecode(clip.sourceInFrames ?? 0, fps)} ({clip.sourceInFrames ?? 0}f)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Source Out</span>
                  <span className="font-mono text-text-primary">
                    {formatTimecode((clip.sourceInFrames ?? 0) + clip.durationFrames, fps)} (
                    {(clip.sourceInFrames ?? 0) + clip.durationFrames}f)
                  </span>
                </div>

                {/* Slip Stepper Buttons */}
                <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-hairline/50">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Slip backward 10 frames (Alt+Shift+Left)"
                      onClick={() => {
                        const next = slipClipMedia(clip, -10);
                        patchClip(clip.id, {
                          sourceInFrames: next.sourceInFrames,
                          sourceOutFrames: next.sourceOutFrames,
                        });
                      }}
                    >
                      -10f
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Slip backward 1 frame (Alt+Left)"
                      onClick={() => {
                        const next = slipClipMedia(clip, -1);
                        patchClip(clip.id, {
                          sourceInFrames: next.sourceInFrames,
                          sourceOutFrames: next.sourceOutFrames,
                        });
                      }}
                    >
                      -1f
                    </Button>
                  </div>

                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-disabled">
                    Slip Media
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Slip forward 1 frame (Alt+Right)"
                      onClick={() => {
                        const next = slipClipMedia(clip, 1);
                        patchClip(clip.id, {
                          sourceInFrames: next.sourceInFrames,
                          sourceOutFrames: next.sourceOutFrames,
                        });
                      }}
                    >
                      +1f
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Slip forward 10 frames (Alt+Shift+Right)"
                      onClick={() => {
                        const next = slipClipMedia(clip, 10);
                        patchClip(clip.id, {
                          sourceInFrames: next.sourceInFrames,
                          sourceOutFrames: next.sourceOutFrames,
                        });
                      }}
                    >
                      +10f
                    </Button>
                  </div>
                </div>

                {(clip.sourceInFrames ?? 0) > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-[11px] text-text-secondary hover:text-text-primary mt-0.5"
                    onClick={() => {
                      const next = slipClipMedia(clip, -(clip.sourceInFrames ?? 0));
                      patchClip(clip.id, {
                        sourceInFrames: next.sourceInFrames,
                        sourceOutFrames: next.sourceOutFrames,
                      });
                    }}
                  >
                    Reset to Source Start (0f)
                  </Button>
                ) : null}
              </div>
            </Section>
          ) : null}
        </>
      )}

      {/* S154 phase 5 — Text Clip Content */}
      {currentTab === 'text' ? (
        <TextInspectorTab clip={clip} patchClip={patchClip} />
      ) : null}

      {/* S21 / S37 — Speed & Retiming */}
      {currentTab === 'speed' ? (
        <SpeedInspectorTab clip={clip} patchClip={patchClip} />
      ) : null}

      {/* Video / Visual Inspector Controls */}
      <VideoInspectorTab
        clip={clip}
        document={document}
        fps={fps}
        overlay={overlay}
        videoClip={videoClip}
        currentTab={currentTab}
        patchClip={patchClip}
      />

      {/* S154 phase 6 / S32 — Keyframe Bezier Curve Graph Editor & Animation */}
      {currentTab === 'animation' ? (
        <AnimationInspectorTab
          clip={clip}
          fps={fps}
          overlay={overlay}
          carriesSound={carriesSound}
          animationProperties={animationProperties}
          clipRelativePlayhead={clipRelativePlayhead}
          addKeyframe={addKeyframe}
          keyframeRows={keyframeRows}
          patchClip={patchClip}
        />
      ) : null}

      {/* CapCut Video Effects Inspector */}
      {currentTab === 'effect' && !(audio || clip.sourceKind === 'text') ? (
        <VideoEffectInspectorPanel clip={clip} />
      ) : null}

      {/* S154 phase 3 — Per-clip correction & cinematic color grading */}
      {currentTab === 'color' && !(audio || clip.sourceKind === 'text') ? (
        <ColorGradingPanel clip={clip} />
      ) : null}

      {/* S161 — Still Motion Tab */}
      {currentTab === 'motion' && clip.sourceKind === 'still' && !clip.effects?.whiteboard ? (
        <MotionInspectorTab clip={clip} fps={fps} patchClip={patchClip} />
      ) : null}

      {/* Audio Tab */}
      {currentTab === 'audio' && carriesSound ? (
        <AudioInspectorTab
          clip={clip}
          document={document}
          fps={fps}
          carriesSound={carriesSound}
          videoClip={videoClip}
          sourceHasAudio={sourceHasAudio}
          patchClip={patchClip}
          addKeyframe={addKeyframe}
          keyframeRows={keyframeRows}
          clipRelativePlayhead={clipRelativePlayhead}
        />
      ) : null}

      {/* Transition Tab */}
      {currentTab === 'transition' && clip.sourceKind !== 'effect' ? (
        <TransitionInspectorTab clip={clip} fps={fps} patchClip={patchClip} />
      ) : null}
    </div>
  );
});
