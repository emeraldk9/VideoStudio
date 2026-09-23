import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applySubtitleCasing,
  applyStylePresetToClips,
  autoBreakSubtitleLines,
  CAPTION_STYLE_PRESETS,
  cuesToSequenceClips,
  exportTranscriptText,
  formatSecondsToSRTTimestamp,
  formatTimecode,
  framesToSeconds,
  parseSubtitleContent,
  searchAndReplaceSubtitles,
  splitSubtitleClip,
  timelineClipsToASS,
  timelineClipsToSRT,
  timelineClipsToWebVTT,
  type CaptionPresetId,
  type SequenceClip,
  type SubtitleCasing,
} from '@shared';

import {
  currentPlayheadFrame,
  transportClock,
  useSequenceStore,
} from '../../../entities/sequence';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { ensureTextTrack } from '../lib/ensure-free-track';

export function SubtitlesPane() {
  const document = useSequenceStore((state) => state.document);
  const selectedClipIds = useSequenceStore((state) => state.selectedClipIds);
  const pushToast = useToastStore((state) => state.pushToast);

  const fps = document?.sequence.fps ?? 30;

  // Track filter: 'all' or specific trackId
  const [selectedTrackId, setSelectedTrackId] = useState<string>('all');

  // Real-time live playhead tracking for active cue highlight
  const [livePlayhead, setLivePlayhead] = useState<number>(() => currentPlayheadFrame());

  // Search & Replace state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);

  // Style drawer state
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const [activeStylePreset, setActiveStylePreset] = useState<CaptionPresetId>('modern');

  // Export menu dropdown state
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Hidden file input for SRT/VTT import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to transportClock for live active cue tracking
  useEffect(() => {
    let lastFrame = -1;
    const unsub = transportClock.subscribe((f) => {
      if (Math.abs(f - lastFrame) >= 2) {
        lastFrame = f;
        setLivePlayhead(f);
      }
    });
    return unsub;
  }, []);

  // Update playhead on store changes
  const storePlayhead = useSequenceStore((state) => state.playheadFrame);
  useEffect(() => {
    setLivePlayhead(storePlayhead);
  }, [storePlayhead]);

  // Video / Text tracks in sequence
  const subtitleTracks = useMemo(() => {
    if (!document) return [];
    return document.tracks.filter((t) => t.kind === 'video');
  }, [document]);

  // Chronologically sorted subtitle/text clips
  const subtitleClips = useMemo(() => {
    if (!document) return [];
    return document.clips
      .filter(
        (c) =>
          c.sourceKind === 'text' &&
          (selectedTrackId === 'all' || c.trackId === selectedTrackId),
      )
      .sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));
  }, [document, selectedTrackId]);

  // Search matches count
  const searchMatchesCount = useMemo(() => {
    if (!searchQuery.trim() || subtitleClips.length === 0) return 0;
    const regex = new RegExp(
      searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      matchCase ? 'g' : 'gi',
    );
    let count = 0;
    for (const clip of subtitleClips) {
      const text = clip.effects?.text?.text ?? clip.label;
      count += (text.match(regex) || []).length;
    }
    return count;
  }, [searchQuery, matchCase, subtitleClips]);

  // Handle Seek Playhead to Cue
  const handleSeekCue = useCallback(
    (clip: SequenceClip) => {
      const start = clip.startFrames ?? 0;
      useSequenceStore.getState().setPlayhead(start);
      useSequenceStore.getState().select([clip.id]);
    },
    [],
  );

  // Handle Text Change on a Cue
  const handleTextChange = useCallback(
    (clipId: string, newText: string) => {
      const freshDoc = useSequenceStore.getState().document;
      if (!freshDoc) return;

      const nextClips = freshDoc.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const trimmed = newText.trim();
        const label = trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed || 'Subtitle';
        return {
          ...clip,
          label,
          effects: {
            ...clip.effects,
            text: {
              ...(clip.effects?.text ?? CAPTION_STYLE_PRESETS[activeStylePreset].effects),
              text: newText,
            },
          },
        };
      });

      useSequenceStore.getState().commitClips(nextClips);
    },
    [activeStylePreset],
  );

  // Handle Add Caption at Current Playhead
  const handleAddCaptionAtPlayhead = useCallback(async () => {
    const fresh = useSequenceStore.getState();
    if (!fresh.document) return;

    const startFrames = currentPlayheadFrame();
    const durationFrames = Math.max(1, Math.round(fps * 2.5)); // 2.5s default subtitle length

    const trackId =
      selectedTrackId !== 'all'
        ? selectedTrackId
        : await ensureTextTrack();

    if (!trackId) {
      pushToast({ variant: 'error', message: 'Could not create or locate a text track.' });
      return;
    }

    const doc = useSequenceStore.getState().document;
    if (!doc) return;

    const preset = CAPTION_STYLE_PRESETS[activeStylePreset];
    const newClip: SequenceClip = {
      id: crypto.randomUUID(),
      sequenceId: doc.sequence.id,
      trackId,
      orderIndex: doc.clips.filter((c) => c.trackId === trackId).length,
      sourceKind: 'text',
      filePath: null,
      startFrames,
      durationFrames,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'New Subtitle',
      colorLabel: 'violet',
      overrides: [],
      effects: {
        text: {
          ...preset.effects,
          text: 'Enter subtitle text…',
        },
      },
    };

    useSequenceStore.getState().commitClips([...doc.clips, newClip]);
    useSequenceStore.getState().select([newClip.id]);
    pushToast({ variant: 'success', message: `Added caption at ${formatTimecode(startFrames, fps)}.` });
  }, [activeStylePreset, fps, pushToast, selectedTrackId]);

  // Handle Split Cue at Playhead
  const handleSplitCue = useCallback(
    (clip: SequenceClip) => {
      const splitFrame = currentPlayheadFrame();
      const split = splitSubtitleClip(clip, splitFrame);
      if (!split) {
        pushToast({
          variant: 'warning',
          message: 'Playhead must be inside the subtitle cue span to split.',
        });
        return;
      }

      const doc = useSequenceStore.getState().document;
      if (!doc) return;

      const [c1, c2] = split;
      const nextClips = doc.clips.map((c) => (c.id === clip.id ? c1 : c));
      nextClips.push(c2);

      useSequenceStore.getState().commitClips(nextClips);
      useSequenceStore.getState().select([c2.id]);
      pushToast({ variant: 'success', message: 'Split subtitle cue.' });
    },
    [pushToast],
  );

  // Handle Delete Cue
  const handleDeleteCue = useCallback(
    (clipId: string) => {
      const doc = useSequenceStore.getState().document;
      if (!doc) return;

      const nextClips = doc.clips.filter((c) => c.id !== clipId);
      useSequenceStore.getState().commitClips(nextClips);
      pushToast({ variant: 'info', message: 'Subtitle cue removed.' });
    },
    [pushToast],
  );

  // Handle Auto-Break Cue Line (37 CPL limit)
  const handleAutoBreak = useCallback(
    (clipId: string) => {
      const doc = useSequenceStore.getState().document;
      if (!doc) return;

      const target = doc.clips.find((c) => c.id === clipId);
      if (!target) return;

      const text = target.effects?.text?.text ?? target.label;
      const broken = autoBreakSubtitleLines(text, 37);

      handleTextChange(clipId, broken);
      pushToast({ variant: 'success', message: 'Formatted line breaks for standard legibility.' });
    },
    [handleTextChange, pushToast],
  );

  // Handle Search & Replace All
  const handleReplaceAll = useCallback(() => {
    if (!searchQuery.trim()) return;
    const doc = useSequenceStore.getState().document;
    if (!doc) return;

    const { clips: nextClips, matchCount } = searchAndReplaceSubtitles(
      doc.clips,
      searchQuery,
      replaceQuery,
      {
        matchCase,
        trackId: selectedTrackId !== 'all' ? selectedTrackId : undefined,
      },
    );

    if (matchCount > 0) {
      useSequenceStore.getState().commitClips(nextClips);
      pushToast({
        variant: 'success',
        message: `Replaced ${matchCount} occurrence${matchCount === 1 ? '' : 's'} across subtitles.`,
      });
      setSearchQuery('');
      setReplaceQuery('');
    } else {
      pushToast({ variant: 'warning', message: 'No matching text found in subtitles.' });
    }
  }, [matchCase, pushToast, replaceQuery, searchQuery, selectedTrackId]);

  // Handle Apply Style to All Subtitles
  const handleApplyStyleToAll = useCallback(
    (presetId: CaptionPresetId) => {
      const doc = useSequenceStore.getState().document;
      if (!doc) return;

      const nextClips = applyStylePresetToClips(
        doc.clips,
        presetId,
        selectedTrackId !== 'all' ? selectedTrackId : undefined,
      );

      useSequenceStore.getState().commitClips(nextClips);
      setActiveStylePreset(presetId);
      pushToast({
        variant: 'success',
        message: `Applied ${CAPTION_STYLE_PRESETS[presetId].label} style to all captions.`,
      });
    },
    [pushToast, selectedTrackId],
  );

  // Handle Casing Transformation across all subtitles
  const handleApplyCasingToAll = useCallback(
    (casing: SubtitleCasing) => {
      const doc = useSequenceStore.getState().document;
      if (!doc) return;

      const nextClips = doc.clips.map((clip) => {
        if (clip.sourceKind !== 'text') return clip;
        if (selectedTrackId !== 'all' && clip.trackId !== selectedTrackId) return clip;

        const currentText = clip.effects?.text?.text ?? clip.label;
        const newText = applySubtitleCasing(currentText, casing);
        return {
          ...clip,
          label: newText.length > 36 ? `${newText.slice(0, 36)}…` : newText,
          effects: {
            ...clip.effects,
            text: {
              ...(clip.effects?.text ?? CAPTION_STYLE_PRESETS[activeStylePreset].effects),
              text: newText,
            },
          },
        };
      });

      useSequenceStore.getState().commitClips(nextClips);
      pushToast({ variant: 'success', message: `Converted all captions to ${casing}.` });
    },
    [activeStylePreset, pushToast, selectedTrackId],
  );

  // Handle Import File (.srt, .vtt, .ass, .txt)
  const handleFileImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const parsedCues = parseSubtitleContent(content);
      if (parsedCues.length === 0) {
        pushToast({
          variant: 'error',
          message: 'No valid subtitle cues or timestamps found in file.',
        });
        return;
      }

      const trackId =
        selectedTrackId !== 'all'
          ? selectedTrackId
          : await ensureTextTrack();

      if (!trackId) {
        pushToast({ variant: 'error', message: 'Could not create text track for subtitles.' });
        return;
      }

      const doc = useSequenceStore.getState().document;
      if (!doc) return;

      const { clips: newClips, skipped } = cuesToSequenceClips(parsedCues, {
        targetTrackId: trackId,
        sequenceId: doc.sequence.id,
        fps,
        stylePreset: activeStylePreset,
      });

      useSequenceStore.getState().commitClips([...doc.clips, ...newClips]);
      pushToast({
        variant: 'success',
        message: `Imported ${newClips.length} subtitle cues from ${file.name}${skipped > 0 ? ` (${skipped} blank cues skipped)` : ''}.`,
      });
    };
    reader.readAsText(file);
  };

  // Handle Export File Download
  const handleExportDownload = (format: 'srt' | 'vtt' | 'ass' | 'txt') => {
    if (!document || subtitleClips.length === 0) {
      pushToast({ variant: 'warning', message: 'No subtitles on timeline to export.' });
      return;
    }

    const filterTrack = selectedTrackId !== 'all' ? selectedTrackId : undefined;
    let fileContent = '';
    let ext = 'srt';
    let mime = 'text/plain';

    if (format === 'srt') {
      fileContent = timelineClipsToSRT(document.clips, fps, filterTrack);
      ext = 'srt';
    } else if (format === 'vtt') {
      fileContent = timelineClipsToWebVTT(document.clips, fps, filterTrack);
      ext = 'vtt';
      mime = 'text/vtt';
    } else if (format === 'ass') {
      fileContent = timelineClipsToASS(document.clips, fps, {
        trackId: filterTrack,
        videoWidth: document.sequence.width,
        videoHeight: document.sequence.height,
      });
      ext = 'ass';
    } else if (format === 'txt') {
      fileContent = exportTranscriptText(document.clips, fps, {
        includeTimestamps: true,
        trackId: filterTrack,
      });
      ext = 'txt';
    }

    const blob = new Blob([fileContent], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.sequence.name.replace(/\s+/g, '_')}_subtitles.${ext}`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIsExportOpen(false);
    pushToast({ variant: 'success', message: `Exported ${ext.toUpperCase()} subtitles file.` });
  };

  // Handle Copy Transcript to Clipboard
  const handleCopyTranscript = (withTimestamps: boolean) => {
    if (!document || subtitleClips.length === 0) {
      pushToast({ variant: 'warning', message: 'No subtitles on timeline to copy.' });
      return;
    }

    const text = exportTranscriptText(document.clips, fps, {
      includeTimestamps: withTimestamps,
      trackId: selectedTrackId !== 'all' ? selectedTrackId : undefined,
    });

    void navigator.clipboard.writeText(text).then(() => {
      setIsExportOpen(false);
      pushToast({ variant: 'success', message: 'Copied subtitle transcript to clipboard.' });
    });
  };

  // Handle Auto-Generate Captions from Timeline
  const handleGenerateAutoCaptions = async () => {
    const fresh = useSequenceStore.getState();
    if (!fresh.document) return;

    const audioClips = fresh.document.clips.filter(
      (c) => c.sourceKind === 'audio' || (c.sourceKind === 'video' && c.sourceAudioEnabled !== false),
    );

    if (audioClips.length === 0) {
      pushToast({
        variant: 'warning',
        message: 'No media or audio clips found on timeline to generate captions from.',
      });
      return;
    }

    const trackId =
      selectedTrackId !== 'all'
        ? selectedTrackId
        : await ensureTextTrack();

    if (!trackId) {
      pushToast({ variant: 'error', message: 'Could not create text track for subtitles.' });
      return;
    }

    const doc = useSequenceStore.getState().document;
    if (!doc) return;

    // Generate balanced cadence cues along the sequence duration
    const generatedClips: SequenceClip[] = [];
    let startFrame = 0;
    const standardDuration = Math.round(fps * 3.0); // 3 seconds per caption chunk
    const maxTimelineFrame = Math.max(
      ...doc.clips.map((c) => (c.startFrames ?? 0) + c.durationFrames),
      fps * 10,
    );

    let cueIndex = 1;
    while (startFrame < maxTimelineFrame) {
      const dur = Math.min(standardDuration, maxTimelineFrame - startFrame);
      if (dur < fps * 0.5) break;

      const sampleDialogue = `[Speaker dialogue cue #${cueIndex}]`;
      const clip: SequenceClip = {
        id: crypto.randomUUID(),
        sequenceId: doc.sequence.id,
        trackId,
        orderIndex: cueIndex - 1,
        sourceKind: 'text',
        filePath: null,
        startFrames: startFrame,
        durationFrames: dur,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: sampleDialogue,
        colorLabel: 'violet',
        overrides: [],
        effects: {
          text: {
            ...CAPTION_STYLE_PRESETS[activeStylePreset].effects,
            text: sampleDialogue,
          },
        },
      };

      generatedClips.push(clip);
      startFrame += dur;
      cueIndex++;
      if (cueIndex > 50) break; // safety cap
    }

    useSequenceStore.getState().commitClips([...doc.clips, ...generatedClips]);
    pushToast({
      variant: 'success',
      message: `Generated ${generatedClips.length} dialogue caption placeholders across timeline.`,
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg-app text-text-primary text-xs">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileImport(file);
          e.target.value = '';
        }}
      />

      {/* Top Header & Navigation Rail */}
      <div className="flex shrink-0 flex-col border-b border-hairline bg-bg-canvas px-3 py-2.5 gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-text-primary">
            <span className="material-symbols-outlined text-base text-accent-ai">closed_caption</span>
            <span>Subtitles & Captions</span>
            <span className="ml-1 rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] font-mono text-text-secondary">
              {subtitleClips.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <IconButton
              icon="search"
              size="sm"
              label="Search & Replace"
              emphasis={isSearchOpen}
              aria-pressed={isSearchOpen}
              onClick={() => setIsSearchOpen((prev) => !prev)}
            />
            <IconButton
              icon="palette"
              size="sm"
              label="Style Presets & Casing"
              emphasis={isStyleOpen}
              aria-pressed={isStyleOpen}
              onClick={() => setIsStyleOpen((prev) => !prev)}
            />
            <div className="relative">
              <IconButton
                icon="file_upload"
                size="sm"
                label="Import Subtitles (.srt, .vtt, .ass)"
                onClick={() => fileInputRef.current?.click()}
              />
            </div>
            <div className="relative">
              <IconButton
                icon="file_download"
                size="sm"
                label="Export Subtitles"
                emphasis={isExportOpen}
                aria-pressed={isExportOpen}
                onClick={() => setIsExportOpen((prev) => !prev)}
              />
              {isExportOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-hairline bg-bg-elevated p-1 shadow-xl"
                  onMouseLeave={() => setIsExportOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => handleExportDownload('srt')}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span className="material-symbols-outlined text-sm text-text-secondary">subtitles</span>
                    <span>Export SubRip (.srt)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportDownload('vtt')}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span className="material-symbols-outlined text-sm text-text-secondary">description</span>
                    <span>Export WebVTT (.vtt)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportDownload('ass')}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span className="material-symbols-outlined text-sm text-text-secondary">brush</span>
                    <span>Export Styled (.ass)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportDownload('txt')}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span className="material-symbols-outlined text-sm text-text-secondary">text_snippet</span>
                    <span>Export Transcript (.txt)</span>
                  </button>
                  <div className="my-1 border-t border-hairline" />
                  <button
                    type="button"
                    onClick={() => handleCopyTranscript(true)}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span className="material-symbols-outlined text-sm text-text-secondary">content_copy</span>
                    <span>Copy with Timecodes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyTranscript(false)}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span className="material-symbols-outlined text-sm text-text-secondary">content_copy</span>
                    <span>Copy Text Only</span>
                  </button>
                </div>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddCaptionAtPlayhead}
              title="Add caption at current playhead position"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add
            </Button>
          </div>
        </div>

        {/* Track Scope Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="subtitle-track-select" className="text-[11px] text-text-secondary shrink-0">
            Lane:
          </label>
          <select
            id="subtitle-track-select"
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="h-7 w-full rounded border border-hairline bg-bg-surface px-2 py-0 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
          >
            <option value="all">All Text & Subtitle Lanes ({subtitleClips.length} cues)</option>
            {subtitleTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name} ({document?.clips.filter((c) => c.trackId === track.id && c.sourceKind === 'text').length || 0} cues)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expandable Search & Replace Bar */}
      {isSearchOpen && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-bg-surface/80 p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2 top-1.5 text-sm text-text-secondary">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in subtitles…"
                className="h-7 w-full rounded border border-hairline bg-bg-canvas pl-7 pr-2 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
              />
            </div>
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2 top-1.5 text-sm text-text-secondary">
                find_replace
              </span>
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace with…"
                className="h-7 w-full rounded border border-hairline bg-bg-canvas pl-7 pr-2 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="rounded border-hairline bg-bg-canvas text-accent-ai focus:ring-0"
              />
              <span>Match Case</span>
              {searchQuery && (
                <span className="ml-1 text-accent-ai font-medium">
                  ({searchMatchesCount} {searchMatchesCount === 1 ? 'match' : 'matches'})
                </span>
              )}
            </label>

            <Button
              variant="secondary"
              size="sm"
              disabled={!searchQuery.trim() || searchMatchesCount === 0}
              onClick={handleReplaceAll}
            >
              Replace All
            </Button>
          </div>
        </div>
      )}

      {/* Expandable Style Presets & Casing Bar */}
      {isStyleOpen && (
        <div className="flex shrink-0 flex-col gap-2.5 border-b border-hairline bg-bg-surface/90 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
              Visual Preset
            </span>
            <span className="text-[10px] text-text-secondary">Click to apply to all</span>
          </div>

          {/* Preset Buttons Grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(CAPTION_STYLE_PRESETS) as CaptionPresetId[]).map((presetKey) => {
              const preset = CAPTION_STYLE_PRESETS[presetKey];
              const isSelected = activeStylePreset === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => handleApplyStyleToAll(presetKey)}
                  className={`flex flex-col items-start rounded-md border p-2 text-left transition-all ${
                    isSelected
                      ? 'border-accent-ai bg-accent-ai/10 text-accent-ai'
                      : 'border-hairline bg-bg-canvas hover:border-hairline-bright hover:bg-bg-hover'
                  }`}
                >
                  <span className="text-[11px] font-semibold">{preset.label}</span>
                  <span className="text-[10px] text-text-secondary line-clamp-1">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Casing Converters */}
          <div className="flex items-center justify-between pt-1 border-t border-hairline/60">
            <span className="text-[11px] text-text-secondary">Text Casing:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleApplyCasingToAll('uppercase')}
                className="rounded px-2 py-0.5 text-[10px] font-semibold border border-hairline hover:bg-bg-hover"
              >
                UPPER
              </button>
              <button
                type="button"
                onClick={() => handleApplyCasingToAll('titlecase')}
                className="rounded px-2 py-0.5 text-[10px] font-semibold border border-hairline hover:bg-bg-hover"
              >
                Title
              </button>
              <button
                type="button"
                onClick={() => handleApplyCasingToAll('sentencecase')}
                className="rounded px-2 py-0.5 text-[10px] font-semibold border border-hairline hover:bg-bg-hover"
              >
                Sentence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Subtitles Cue Transcript List */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2.5 gap-2 select-none">
        {subtitleClips.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-text-secondary">
            <span className="material-symbols-outlined text-4xl text-text-tertiary mb-2">
              subtitles_off
            </span>
            <p className="text-sm font-semibold text-text-primary">No Subtitles Yet</p>
            <p className="mt-1 text-xs max-w-xs text-text-secondary">
              Import a subtitle file, generate auto-captions from dialogue, or add cue cards at the playhead.
            </p>

            <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-sm">file_upload</span>
                Import SRT / WebVTT / ASS
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateAutoCaptions}
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                Auto-Generate Captions
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddCaptionAtPlayhead}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Subtitle at Playhead
              </Button>
            </div>
          </div>
        ) : (
          subtitleClips.map((clip, index) => {
            const startFrames = clip.startFrames ?? 0;
            const durationFrames = clip.durationFrames;
            const endFrames = startFrames + durationFrames;

            const isCurrent = livePlayhead >= startFrames && livePlayhead < endFrames;
            const isSelected = selectedClipIds.includes(clip.id);

            const text = clip.effects?.text?.text ?? clip.label;
            const charCount = text.length;
            const isOverCpl = charCount > 37;

            const canSplitAtPlayhead =
              livePlayhead > startFrames && livePlayhead < endFrames;

            return (
              <div
                key={clip.id}
                onClick={() => handleSeekCue(clip)}
                className={`group relative flex flex-col rounded-lg border p-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-accent-ai bg-accent-ai/5 shadow-sm'
                    : isCurrent
                    ? 'border-accent-ai/60 bg-bg-surface shadow-sm'
                    : 'border-hairline bg-bg-surface hover:border-hairline-bright hover:bg-bg-hover/50'
                }`}
              >
                {/* Cue Header Bar */}
                <div className="flex items-center justify-between gap-1 text-[11px] mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-text-secondary">
                      #{index + 1}
                    </span>

                    {/* Active Playhead Live Badge */}
                    {isCurrent && (
                      <span className="flex items-center gap-1 rounded bg-accent-ai/20 px-1.5 py-0.2 text-[9px] font-bold text-accent-ai tracking-wider uppercase">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-ai animate-pulse" />
                        Current
                      </span>
                    )}

                    {/* Timecodes */}
                    <span className="font-mono text-text-secondary hover:text-accent-ai transition-colors">
                      {formatTimecode(startFrames, fps)} → {formatTimecode(endFrames, fps)}
                    </span>

                    {/* Duration */}
                    <span className="text-[10px] text-text-tertiary">
                      ({framesToSeconds(durationFrames, fps).toFixed(1)}s)
                    </span>
                  </div>

                  {/* Right Header Badges & Actions */}
                  <div className="flex items-center gap-1">
                    {/* CPL warning badge */}
                    {isOverCpl && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAutoBreak(clip.id);
                        }}
                        title="Line exceeds 37 chars. Click to auto-break lines."
                        className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-medium text-amber-400 hover:bg-amber-500/30"
                      >
                        <span>{charCount}c</span>
                        <span className="material-symbols-outlined text-[11px]">wrap_text</span>
                      </button>
                    )}

                    {/* Split Cue at Playhead */}
                    {canSplitAtPlayhead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSplitCue(clip);
                        }}
                        title={`Split cue at playhead (${formatTimecode(livePlayhead, fps)})`}
                        className="rounded p-0.5 text-text-secondary hover:bg-bg-hover hover:text-accent-ai transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">call_split</span>
                      </button>
                    )}

                    {/* Delete Cue */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCue(clip.id);
                      }}
                      title="Delete subtitle cue"
                      className="rounded p-0.5 text-text-secondary hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </div>

                {/* Inline Editable Textarea */}
                <textarea
                  value={text}
                  rows={Math.max(1, text.split('\n').length)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleTextChange(clip.id, e.target.value)}
                  placeholder="Enter subtitle text…"
                  className="w-full resize-none rounded border border-transparent bg-transparent p-1 text-xs text-text-primary leading-relaxed focus:border-accent-ai/50 focus:bg-bg-canvas focus:outline-none transition-colors"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Summary Bar */}
      {subtitleClips.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t border-hairline bg-bg-canvas px-3 py-1.5 text-[11px] text-text-secondary">
          <span>
            {subtitleClips.length} cue{subtitleClips.length === 1 ? '' : 's'} ·{' '}
            {subtitleClips.reduce((acc, c) => acc + c.durationFrames, 0) / fps > 0
              ? `${(subtitleClips.reduce((acc, c) => acc + c.durationFrames, 0) / fps).toFixed(1)}s total speech`
              : '0s'}
          </span>
          <button
            type="button"
            onClick={() => handleCopyTranscript(true)}
            className="flex items-center gap-1 hover:text-text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-xs">content_copy</span>
            <span>Copy Transcript</span>
          </button>
        </div>
      )}
    </div>
  );
}
