import React, { useMemo } from 'react';
import {
  anchorClipToParent,
  detachClipAnchor,
  isClipAnchored,
  resolveClipAbsoluteStart,
  type AnchorPoint,
  type OrphanPolicy,
  type SequenceClip,
  type SequenceDocument,
} from '@shared';
import { Button } from '../../../../shared/ui/Button';
import { Section } from '../../../../shared/ui/Section';
import { Select, type SelectOption } from '../../../../shared/ui/Select';

export interface AnchorSectionProps {
  clip: SequenceClip;
  document: SequenceDocument;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

const ANCHOR_POINT_OPTIONS: SelectOption[] = [
  { value: 'start', label: 'Head (Clip Start)' },
  { value: 'midpoint', label: 'Center (Midpoint)' },
  { value: 'end', label: 'Tail (Clip End)' },
];

const ORPHAN_POLICY_OPTIONS: SelectOption[] = [
  { value: 'keep_absolute', label: 'Keep Absolute' },
  { value: 'delete', label: 'Cascade Delete' },
  { value: 'reanchor_nearest', label: 'Re-anchor Nearest' },
];

export const AnchorSection = React.memo(function AnchorSection({
  clip,
  document,
  patchClip,
}: AnchorSectionProps) {
  const isAnchored = isClipAnchored(clip);
  const anchorSettings = clip.effects?.anchor;

  // Potential parent clips: cannot anchor to self or to its own track in standard storylines
  const candidateParents = useMemo(() => {
    return document.clips.filter((c) => c.id !== clip.id);
  }, [document.clips, clip.id]);

  const candidateParentOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'Select Parent Clip to Anchor...', disabled: true },
      ...candidateParents.map((cand) => ({
        value: cand.id,
        label: `${cand.label || 'Clip'} (${cand.sourceKind})`,
      })),
    ];
  }, [candidateParents]);

  // Find spine clips preferentially
  const spineClips = useMemo(() => {
    return document.clips.filter(
      (c) => c.trackId === document.sequence.spineTrackId && c.id !== clip.id
    );
  }, [document.clips, document.sequence.spineTrackId, clip.id]);

  const currentParent = useMemo(() => {
    if (!isAnchored || !anchorSettings?.parentClipId) return null;
    return document.clips.find((c) => c.id === anchorSettings.parentClipId) ?? null;
  }, [document.clips, isAnchored, anchorSettings?.parentClipId]);

  const parentTrack = useMemo(() => {
    if (!currentParent) return null;
    return document.tracks.find((t) => t.id === currentParent.trackId) ?? null;
  }, [document.tracks, currentParent]);

  const handleAnchorToParent = (parentId: string, anchorPoint: AnchorPoint = 'start') => {
    const parent = document.clips.find((c) => c.id === parentId);
    if (!parent) return;

    const updated = anchorClipToParent({
      childClip: clip,
      parentClip: parent,
      allClips: document.clips,
      anchorPoint,
      orphanPolicy: 'keep_absolute',
    });

    patchClip(clip.id, {
      effects: updated.effects,
    });
  };

  const handleDetach = () => {
    const detached = detachClipAnchor(clip, document.clips);
    patchClip(clip.id, {
      startFrames: detached.startFrames,
      effects: detached.effects,
    });
  };

  const handleUpdateAnchorPoint = (point: AnchorPoint) => {
    if (!currentParent || !anchorSettings) return;
    const updated = anchorClipToParent({
      childClip: clip,
      parentClip: currentParent,
      allClips: document.clips,
      anchorPoint: point,
      orphanPolicy: anchorSettings.orphanPolicy ?? 'keep_absolute',
    });
    patchClip(clip.id, {
      effects: updated.effects,
    });
  };

  const handleUpdateOrphanPolicy = (policy: OrphanPolicy) => {
    if (!anchorSettings) return;
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        anchor: {
          ...anchorSettings,
          orphanPolicy: policy,
        },
      },
    });
  };

  const handleNudgeOffset = (delta: number) => {
    if (!anchorSettings) return;
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        anchor: {
          ...anchorSettings,
          offsetFrames: anchorSettings.offsetFrames + delta,
        },
      },
    });
  };

  return (
    <Section title="Connected Clip Anchor">
      <div className="flex flex-col gap-2.5 rounded-card border border-hairline/80 bg-bg-app p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <span
              className={`material-symbols-outlined text-[16px] ${
                isAnchored ? 'text-indigo-400' : 'text-text-disabled'
              }`}
            >
              anchor
            </span>
            <span>{isAnchored ? 'Anchored to Storyline' : 'Unanchored (Floating)'}</span>
          </div>

          {isAnchored ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDetach}
              className="text-[11px] text-red-400 hover:text-red-300"
              title="Detach clip from parent, retaining current absolute position"
            >
              Detach
            </Button>
          ) : null}
        </div>

        {isAnchored && currentParent ? (
          <div className="flex flex-col gap-2 pt-1 border-t border-hairline/60 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Parent Clip:</span>
              <span className="font-semibold text-text-primary truncate max-w-[140px]">
                {currentParent.label || 'Spine Clip'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Track:</span>
              <span className="text-text-primary font-mono text-[11px]">
                {parentTrack?.name || 'V1 (Spine)'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Relative Offset:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNudgeOffset(-1)}
                  className="px-1.5 h-5 text-[10px]"
                >
                  -1f
                </Button>
                <span className="font-mono font-bold text-indigo-400 min-w-[36px] text-center">
                  {(anchorSettings?.offsetFrames ?? 0) >= 0
                    ? `+${anchorSettings?.offsetFrames}`
                    : anchorSettings?.offsetFrames}
                  f
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNudgeOffset(1)}
                  className="px-1.5 h-5 text-[10px]"
                >
                  +1f
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-text-secondary">Anchor Point:</span>
              <div className="w-[140px]">
                <Select
                  options={ANCHOR_POINT_OPTIONS}
                  value={anchorSettings?.anchorPoint ?? 'start'}
                  onChange={(val) => handleUpdateAnchorPoint(val as AnchorPoint)}
                  size="sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">If Parent Deleted:</span>
              <div className="w-[140px]">
                <Select
                  options={ORPHAN_POLICY_OPTIONS}
                  value={anchorSettings?.orphanPolicy ?? 'keep_absolute'}
                  onChange={(val) => handleUpdateOrphanPolicy(val as OrphanPolicy)}
                  size="sm"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1 border-t border-hairline/60">
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Anchor this secondary clip to a primary spine clip to lock their relative timing during trims, ripples, and moves.
            </p>

            {spineClips.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-300 border-indigo-500/40 hover:bg-indigo-950/40"
                onClick={() => {
                  // Find nearest spine clip to this clip's start
                  const childStart = resolveClipAbsoluteStart(clip, document.clips);
                  let nearest = spineClips[0];
                  let minDiff = Infinity;
                  for (const sc of spineClips) {
                    const scStart = resolveClipAbsoluteStart(sc, document.clips);
                    const diff = Math.abs(childStart - scStart);
                    if (diff < minDiff) {
                      minDiff = diff;
                      nearest = sc;
                    }
                  }
                  handleAnchorToParent(nearest.id, 'start');
                }}
              >
                <span className="material-symbols-outlined text-[14px]">anchor</span>
                <span>Anchor to Nearest Spine Clip</span>
              </Button>
            ) : candidateParents.length > 0 ? (
              <div className="w-full">
                <Select
                  options={candidateParentOptions}
                  value=""
                  onChange={(parentId) => {
                    if (parentId) {
                      handleAnchorToParent(parentId, 'start');
                    }
                  }}
                  size="sm"
                />
              </div>
            ) : (
              <span className="text-[11px] text-text-disabled italic">
                No eligible parent clips available.
              </span>
            )}
          </div>
        )}
      </div>
    </Section>
  );
});
