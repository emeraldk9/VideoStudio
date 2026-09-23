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
  CADENCE_PACING_PRESETS,
  SPOKEN_LANGUAGES,
  generateAutoCaptionsForSequence,
  TRANSLATION_LANGUAGES,
  formatBilingualSubtitleText,
  translateSubtitleClips,
  translateSubtitleText,
  type BilingualLayout,
  type CaptionPresetId,
  type PacingPresetId,
  type SequenceClip,
  type SpokenLanguageCode,
  type SubtitleCasing,
  type TranslationLanguageCode,
  type TranslationMode,
  applySmartJumpCutsToSequence,
  scanSequenceForSmartCuts,
  DEFAULT_FILLER_WORDS,
  type CutInterval,
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

  // Auto-Captions AI Drawer state
  const [isAutoCaptionsOpen, setIsAutoCaptionsOpen] = useState(false);
  const [autoCapSourceTrack, setAutoCapSourceTrack] = useState<string>('all');
  const [autoCapLanguage, setAutoCapLanguage] = useState<SpokenLanguageCode>('en');
  const [autoCapPacing, setAutoCapPacing] = useState<PacingPresetId>('standard_broadcast');
  const [autoCapStyle, setAutoCapStyle] = useState<CaptionPresetId>('modern');
  const [autoCapClearExisting, setAutoCapClearExisting] = useState(false);
  const [autoCapSilenceThreshold, setAutoCapSilenceThreshold] = useState(0.35);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState<{ step: string; pct: number } | null>(null);

  // Multi-Language Translation & Bilingual state
  const [isTranslateOpen, setIsTranslateOpen] = useState(false);
  const [transSourceLang, setTransSourceLang] = useState<TranslationLanguageCode | 'auto'>('auto');
  const [transTargetLang, setTransTargetLang] = useState<TranslationLanguageCode>('es');
  const [transMode, setTransMode] = useState<TranslationMode>('dual_bilingual');
  const [transBilingualLayout, setTransBilingualLayout] = useState<BilingualLayout>('stacked');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgressPct, setTranslateProgressPct] = useState<number | null>(null);

  // AI Smart Cut (Silences & Fillers) state
  const [isSmartCutOpen, setIsSmartCutOpen] = useState(false);
  const [minSilenceSec, setMinSilenceSec] = useState(0.4);
  const [silencePaddingSec, setSilencePaddingSec] = useState(0.08);
  const [enableSilenceCut, setEnableSilenceCut] = useState(true);
  const [enableFillerCut, setEnableFillerCut] = useState(true);
  const [selectedFillerWords, setSelectedFillerWords] = useState<string[]>([
    'um', 'uh', 'like', 'you know', 'ah', 'er',
  ]);
  const [duplicateSequenceFirst, setDuplicateSequenceFirst] = useState(true);
  const [isExecutingCut, setIsExecutingCut] = useState(false);

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

  // Audio tracks in sequence for auto-captions source selection
  const audioTracks = useMemo(() => {
    if (!document) return [];
    return document.tracks.filter((t) => t.kind === 'audio');
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

  // Handle Auto-Generate Captions via VAD & Speech-to-Text Cadence Alignment
  const handleRunAutoCaptions = async () => {
    const doc = useSequenceStore.getState().document;
    if (!doc) return;

    const trackId =
      selectedTrackId !== 'all'
        ? selectedTrackId
        : await ensureTextTrack();

    if (!trackId) {
      pushToast({ variant: 'error', message: 'Could not create text track for subtitles.' });
      return;
    }

    setIsTranscribing(true);
    setTranscribeProgress({ step: 'Scanning audio waveforms...', pct: 25 });

    setTimeout(() => {
      setTranscribeProgress({ step: 'Detecting speech activity (VAD)...', pct: 55 });

      setTimeout(() => {
        setTranscribeProgress({ step: 'Transcribing speech & aligning cadence...', pct: 85 });

        setTimeout(() => {
          const freshDoc = useSequenceStore.getState().document;
          if (!freshDoc) {
            setIsTranscribing(false);
            setTranscribeProgress(null);
            return;
          }

          const generatedClips = generateAutoCaptionsForSequence(freshDoc, {
            audioTrackId: autoCapSourceTrack,
            language: autoCapLanguage,
            pacingPreset: autoCapPacing,
            stylePresetId: autoCapStyle,
            targetTrackId: trackId,
            silenceThresholdSec: autoCapSilenceThreshold,
          });

          let updatedClips = [...freshDoc.clips];
          if (autoCapClearExisting) {
            updatedClips = updatedClips.filter(
              (c) => c.trackId !== trackId || c.sourceKind !== 'text',
            );
          }

          useSequenceStore.getState().commitClips([...updatedClips, ...generatedClips]);
          setIsTranscribing(false);
          setTranscribeProgress(null);
          setIsAutoCaptionsOpen(false);

          pushToast({
            variant: 'success',
            message: `Generated ${generatedClips.length} AI auto-captions aligned to speech.`,
          });
        }, 250);
      }, 250);
    }, 250);
  };

  // Handle Multi-Language Translation & Dual Bilingual formatting
  const handleApplyTranslation = async () => {
    const doc = useSequenceStore.getState().document;
    if (!doc) return;

    if (subtitleClips.length === 0) {
      pushToast({ variant: 'warning', message: 'No subtitles found to translate.' });
      return;
    }

    setIsTranslating(true);
    setTranslateProgressPct(35);

    setTimeout(async () => {
      setTranslateProgressPct(70);

      setTimeout(async () => {
        const freshDoc = useSequenceStore.getState().document;
        if (!freshDoc) {
          setIsTranslating(false);
          setTranslateProgressPct(null);
          return;
        }

        const clipsToTranslate = freshDoc.clips.filter(
          (c) =>
            c.sourceKind === 'text' &&
            (selectedTrackId === 'all' || c.trackId === selectedTrackId),
        );

        if (transMode === 'duplicate_new_track') {
          // Create new text track for translated subtitles
          const targetLangName = TRANSLATION_LANGUAGES[transTargetLang].name;
          const trackLabel = `Subtitles [${targetLangName}]`;
          await useSequenceStore.getState().addTrack('video', trackLabel, 'text');
          const postDoc = useSequenceStore.getState().document;
          const newTrack =
            postDoc?.tracks.find((t) => t.name === trackLabel) ??
            postDoc?.tracks[postDoc.tracks.length - 1];
          const newTrackId = newTrack?.id;
          if (!newTrackId) {
            setIsTranslating(false);
            setTranslateProgressPct(null);
            pushToast({ variant: 'error', message: 'Failed to create translation track.' });
            return;
          }

          const translatedClips = translateSubtitleClips(clipsToTranslate, {
            sourceLang: transSourceLang,
            targetLang: transTargetLang,
            mode: 'duplicate_new_track',
            targetTrackId: newTrackId,
            secondaryColorHex: '#fef08a',
            secondaryFontScale: 0.85,
          });

          useSequenceStore.getState().commitClips([...freshDoc.clips, ...translatedClips]);
          setIsTranslating(false);
          setTranslateProgressPct(null);
          setIsTranslateOpen(false);

          pushToast({
            variant: 'success',
            message: `Created new track with ${translatedClips.length} translated subtitles in ${targetLangName}.`,
          });
        } else {
          // In-place translation (replace_in_place or dual_bilingual)
          const translatedClips = translateSubtitleClips(clipsToTranslate, {
            sourceLang: transSourceLang,
            targetLang: transTargetLang,
            mode: transMode,
            bilingualLayout: transBilingualLayout,
          });

          const translatedMap = new Map(translatedClips.map((c) => [c.id, c]));
          const updatedClips = freshDoc.clips.map((c) => translatedMap.get(c.id) ?? c);

          useSequenceStore.getState().commitClips(updatedClips);
          setIsTranslating(false);
          setTranslateProgressPct(null);
          setIsTranslateOpen(false);

          const modeLabel =
            transMode === 'dual_bilingual'
              ? 'dual bilingual subtitles'
              : `subtitles translated into ${TRANSLATION_LANGUAGES[transTargetLang].name}`;
          pushToast({
            variant: 'success',
            message: `Updated ${translatedClips.length} ${modeLabel}.`,
          });
        }
      }, 250);
    }, 250);
  };

  // AI Smart Cut scan and metrics
  const detectedCuts = useMemo((): CutInterval[] => {
    if (!document || !isSmartCutOpen) return [];
    return scanSequenceForSmartCuts(document, {
      fps,
      minSilenceDurationSec: minSilenceSec,
      silencePaddingSec,
      enableSilenceRemoval: enableSilenceCut,
      enableFillerRemoval: enableFillerCut,
      selectedFillerWords,
    });
  }, [
    document,
    isSmartCutOpen,
    fps,
    minSilenceSec,
    silencePaddingSec,
    enableSilenceCut,
    enableFillerCut,
    selectedFillerWords,
  ]);

  const silenceCutCount = useMemo(
    () => detectedCuts.filter((c) => c.type === 'silence').length,
    [detectedCuts],
  );
  const fillerCutCount = useMemo(
    () => detectedCuts.filter((c) => c.type === 'filler').length,
    [detectedCuts],
  );
  const totalSavedSec = useMemo(
    () =>
      Number(
        (detectedCuts.reduce((acc, c) => acc + c.durationFrames, 0) / fps).toFixed(2),
      ),
    [detectedCuts, fps],
  );

  const handleApplySmartCut = async () => {
    const doc = useSequenceStore.getState().document;
    if (!doc) return;
    if (detectedCuts.length === 0) {
      pushToast({ variant: 'warning', message: 'No silences or filler words detected.' });
      return;
    }

    setIsExecutingCut(true);
    try {
      const result = applySmartJumpCutsToSequence(doc, detectedCuts, {
        fps,
        duplicateSequence: duplicateSequenceFirst,
        microFadeFrames: 3,
      });

      if (duplicateSequenceFirst) {
        const newName = `${doc.sequence.name} [Smart Cut]`;
        if (!window.api?.sequence?.create) {
          throw new Error('Sequence creation API unavailable.');
        }
        const backendDoc = await window.api.sequence.create({
          projectId: doc.sequence.projectId,
          name: newName,
        });
        if (backendDoc) {
          const remappedTracks = doc.tracks.map((t) => ({
            ...t,
            sequenceId: backendDoc.sequence.id,
          }));
          const remappedClips = result.document.clips.map((c) => ({
            ...c,
            sequenceId: backendDoc.sequence.id,
          }));
          if (window.api?.sequence?.replaceDocument) {
            await window.api.sequence.replaceDocument({
              sequenceId: backendDoc.sequence.id,
              tracks: remappedTracks,
              clips: remappedClips,
              spineTrackId: doc.sequence.spineTrackId ?? null,
            });
          }
          await useSequenceStore.getState().openSequence(backendDoc.sequence.id);
          await useSequenceStore.getState().loadSequences(doc.sequence.projectId);
          pushToast({
            variant: 'success',
            message: `Created tightened sequence "${newName}" (${result.cutCount} cuts, saved ${result.savedDurationSec}s)!`,
          });
        }
      } else {
        useSequenceStore.getState().commitClips(result.document.clips);
        pushToast({
          variant: 'success',
          message: `Tightened timeline: removed ${result.silencesRemovedCount} pauses and ${result.fillersRemovedCount} fillers (saved ${result.savedDurationSec}s)!`,
        });
      }
      setIsSmartCutOpen(false);
    } catch (err) {
      pushToast({
        variant: 'error',
        message: `Smart Cut failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsExecutingCut(false);
    }
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
            <IconButton
              icon="auto_awesome"
              size="sm"
              label="AI Auto-Captions (Speech-to-Text)"
              emphasis={isAutoCaptionsOpen}
              aria-pressed={isAutoCaptionsOpen}
              onClick={() => setIsAutoCaptionsOpen((prev) => !prev)}
            />
            <IconButton
              icon="translate"
              size="sm"
              label="Translate & Dual Bilingual Subtitles"
              emphasis={isTranslateOpen}
              aria-pressed={isTranslateOpen}
              onClick={() => setIsTranslateOpen((prev) => !prev)}
            />
            <IconButton
              icon="content_cut"
              size="sm"
              label="AI Smart Cut (Silences & Fillers)"
              emphasis={isSmartCutOpen}
              aria-pressed={isSmartCutOpen}
              onClick={() => setIsSmartCutOpen((prev) => !prev)}
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

      {/* Expandable Auto Captions AI Drawer */}
      {isAutoCaptionsOpen && (
        <div className="flex shrink-0 flex-col gap-3 border-b border-hairline bg-bg-surface/90 p-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <span className="material-symbols-outlined text-sm text-accent-ai">auto_awesome</span>
              <span>AI Auto-Captions & Transcriber</span>
            </div>
            <span className="rounded bg-accent-ai/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-ai">
              VAD + STT Cadence
            </span>
          </div>

          {/* Audio Source Track */}
          <div className="flex flex-col gap-1 text-[11px]">
            <span className="text-text-secondary">Audio Source:</span>
            <select
              value={autoCapSourceTrack}
              onChange={(e) => setAutoCapSourceTrack(e.target.value)}
              className="h-7 w-full rounded border border-hairline bg-bg-canvas px-2 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
            >
              <option value="all">All Timeline Audio Tracks</option>
              {audioTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Spoken Language */}
          <div className="flex flex-col gap-1 text-[11px]">
            <span className="text-text-secondary">Spoken Language:</span>
            <select
              value={autoCapLanguage}
              onChange={(e) => setAutoCapLanguage(e.target.value as SpokenLanguageCode)}
              className="h-7 w-full rounded border border-hairline bg-bg-canvas px-2 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
            >
              {Object.entries(SPOKEN_LANGUAGES).map(([code, lang]) => (
                <option key={code} value={code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cadence Pacing Presets */}
          <div className="flex flex-col gap-1 text-[11px]">
            <span className="text-text-secondary">Cadence & Pacing:</span>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(CADENCE_PACING_PRESETS).map(([id, p]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAutoCapPacing(id as PacingPresetId)}
                  className={`flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all ${
                    autoCapPacing === id
                      ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                      : 'border-hairline bg-bg-canvas text-text-secondary hover:border-hairline-bright'
                  }`}
                  title={p.description}
                >
                  <span className="text-[10px] line-clamp-1">{p.name.split('(')[0].trim()}</span>
                  <span className="text-[9px] font-mono text-text-disabled">≤{p.maxCpl} CPL</span>
                </button>
              ))}
            </div>
          </div>

          {/* Styling Preset Selection */}
          <div className="flex flex-col gap-1 text-[11px]">
            <span className="text-text-secondary">Subtitle Visual Style:</span>
            <div className="grid grid-cols-3 gap-1">
              {Object.entries(CAPTION_STYLE_PRESETS).map(([id, preset]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAutoCapStyle(id as CaptionPresetId)}
                  className={`rounded border px-2 py-1 text-[10px] transition-all truncate ${
                    autoCapStyle === id
                      ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                      : 'border-hairline bg-bg-canvas text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options: Clear Existing */}
          <label className="flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoCapClearExisting}
              onChange={(e) => setAutoCapClearExisting(e.target.checked)}
              className="rounded border-hairline bg-bg-canvas text-accent-ai focus:ring-0"
            />
            <span>Clear existing subtitles on target track</span>
          </label>

          {/* Progress / Generate Button */}
          {isTranscribing ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-accent-ai/40 bg-accent-ai/10 p-2.5">
              <div className="flex items-center justify-between text-xs text-accent-ai font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  {transcribeProgress?.step}
                </span>
                <span className="font-mono">{transcribeProgress?.pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-canvas">
                <div
                  className="h-full bg-accent-ai transition-all duration-300"
                  style={{ width: `${transcribeProgress?.pct}%` }}
                />
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunAutoCaptions}
              className="w-full justify-center"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              Generate Auto-Captions
            </Button>
          )}
        </div>
      )}

      {/* Expandable Multi-Language Translation & Bilingual Drawer */}
      {isTranslateOpen && (
        <div className="flex shrink-0 flex-col gap-3 border-b border-hairline bg-bg-surface/90 p-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <span className="material-symbols-outlined text-sm text-accent-ai">translate</span>
              <span>Translate & Bilingual Subtitles</span>
            </div>
            <span className="rounded bg-accent-ai/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-ai">
              12 Languages
            </span>
          </div>

          {/* Source & Target Language Selectors */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary">Source Language:</span>
              <select
                value={transSourceLang}
                onChange={(e) =>
                  setTransSourceLang(e.target.value as TranslationLanguageCode | 'auto')
                }
                className="h-7 w-full rounded border border-hairline bg-bg-canvas px-2 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
              >
                <option value="auto">🌐 Auto-Detect</option>
                {Object.entries(TRANSLATION_LANGUAGES).map(([code, lang]) => (
                  <option key={code} value={code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-text-secondary">Translate To:</span>
              <select
                value={transTargetLang}
                onChange={(e) =>
                  setTransTargetLang(e.target.value as TranslationLanguageCode)
                }
                className="h-7 w-full rounded border border-hairline bg-bg-canvas px-2 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
              >
                {Object.entries(TRANSLATION_LANGUAGES).map(([code, lang]) => (
                  <option key={code} value={code}>
                    {lang.flag} {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Translation Mode */}
          <div className="flex flex-col gap-1 text-[11px]">
            <span className="text-text-secondary">Workflow Mode:</span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setTransMode('dual_bilingual')}
                className={`flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all ${
                  transMode === 'dual_bilingual'
                    ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                    : 'border-hairline bg-bg-canvas text-text-secondary hover:border-hairline-bright'
                }`}
                title="Stack primary subtitle and translated subtitle in the same cue card"
              >
                <span className="text-[10px] line-clamp-1">Dual Bilingual</span>
                <span className="text-[9px] font-mono text-text-disabled">2-line stack</span>
              </button>

              <button
                type="button"
                onClick={() => setTransMode('replace_in_place')}
                className={`flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all ${
                  transMode === 'replace_in_place'
                    ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                    : 'border-hairline bg-bg-canvas text-text-secondary hover:border-hairline-bright'
                }`}
                title="Replace existing subtitle text with translation directly"
              >
                <span className="text-[10px] line-clamp-1">In-Place</span>
                <span className="text-[9px] font-mono text-text-disabled">Replace text</span>
              </button>

              <button
                type="button"
                onClick={() => setTransMode('duplicate_new_track')}
                className={`flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all ${
                  transMode === 'duplicate_new_track'
                    ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                    : 'border-hairline bg-bg-canvas text-text-secondary hover:border-hairline-bright'
                }`}
                title="Keep original subtitles and create a new dedicated language track"
              >
                <span className="text-[10px] line-clamp-1">New Track</span>
                <span className="text-[9px] font-mono text-text-disabled">+Track</span>
              </button>
            </div>
          </div>

          {/* Bilingual Layout Options (Only for dual_bilingual) */}
          {transMode === 'dual_bilingual' && (
            <div className="flex flex-col gap-1 text-[11px]">
              <span className="text-text-secondary">Bilingual Layout:</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setTransBilingualLayout('stacked')}
                  className={`rounded border px-2 py-1 text-[10px] transition-all truncate ${
                    transBilingualLayout === 'stacked'
                      ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                      : 'border-hairline bg-bg-canvas text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  Primary / Trans
                </button>
                <button
                  type="button"
                  onClick={() => setTransBilingualLayout('reverse_stacked')}
                  className={`rounded border px-2 py-1 text-[10px] transition-all truncate ${
                    transBilingualLayout === 'reverse_stacked'
                      ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                      : 'border-hairline bg-bg-canvas text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  Trans / Primary
                </button>
                <button
                  type="button"
                  onClick={() => setTransBilingualLayout('brackets')}
                  className={`rounded border px-2 py-1 text-[10px] transition-all truncate ${
                    transBilingualLayout === 'brackets'
                      ? 'border-accent-ai bg-accent-ai/10 text-accent-ai font-semibold'
                      : 'border-hairline bg-bg-canvas text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  Text (Trans)
                </button>
              </div>
            </div>
          )}

          {/* Live Preview Card */}
          <div className="flex flex-col gap-1 rounded-lg border border-hairline/80 bg-bg-canvas p-2 text-[11px]">
            <span className="text-[10px] text-text-secondary font-medium">Live Preview:</span>
            <div className="rounded bg-bg-surface/80 p-1.5 text-center font-medium leading-relaxed">
              {(() => {
                const sampleText =
                  subtitleClips[0]?.effects?.text?.text ?? 'Welcome to this video';
                const sampleTrans = translateSubtitleText(
                  sampleText,
                  transTargetLang,
                  transSourceLang,
                );
                if (transMode === 'replace_in_place') {
                  return <span className="text-text-primary">{sampleTrans}</span>;
                }
                if (transMode === 'duplicate_new_track') {
                  return (
                    <span className="text-[#fef08a] font-semibold">
                      [Track 2] {sampleTrans}
                    </span>
                  );
                }
                return (
                  <div className="flex flex-col">
                    <span className="text-text-primary">
                      {transBilingualLayout === 'reverse_stacked' ? sampleTrans : sampleText}
                    </span>
                    <span className="text-accent-ai text-[10px]">
                      {transBilingualLayout === 'brackets'
                        ? `(${sampleTrans})`
                        : transBilingualLayout === 'reverse_stacked'
                        ? sampleText
                        : sampleTrans}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Progress / Apply Translation Button */}
          {isTranslating ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-accent-ai/40 bg-accent-ai/10 p-2.5">
              <div className="flex items-center justify-between text-xs text-accent-ai font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  Translating cues to {TRANSLATION_LANGUAGES[transTargetLang].name}...
                </span>
                <span className="font-mono">{translateProgressPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-canvas">
                <div
                  className="h-full bg-accent-ai transition-all duration-300"
                  style={{ width: `${translateProgressPct}%` }}
                />
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleApplyTranslation}
              className="w-full justify-center"
              disabled={subtitleClips.length === 0}
            >
              <span className="material-symbols-outlined text-sm">translate</span>
              Apply Translation ({subtitleClips.length} cues)
            </Button>
          )}
        </div>
      )}

      {/* Expandable AI Smart Cut (Silences & Fillers) Drawer */}
      {isSmartCutOpen && (
        <div className="flex shrink-0 flex-col gap-3 border-b border-hairline bg-bg-surface/90 p-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <span className="material-symbols-outlined text-sm text-accent-ai">content_cut</span>
              <span>AI Smart Cut & Pause Trimmer</span>
            </div>
            <span className="rounded bg-accent-ai/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-ai">
              {detectedCuts.length} Cuts Detected ({totalSavedSec}s saved)
            </span>
          </div>

          {/* Silence Detection Settings */}
          <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-canvas/60 p-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSilenceCut}
                  onChange={(e) => setEnableSilenceCut(e.target.checked)}
                  className="rounded border-hairline text-accent-ai focus:ring-0"
                />
                <span>Remove Dead-Air Silences</span>
              </label>
              <span className="text-[10px] font-mono text-emerald-400">
                {silenceCutCount} pauses found
              </span>
            </div>

            {enableSilenceCut && (
              <div className="grid grid-cols-2 gap-2 text-[10px] text-text-secondary mt-1">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Min Pause Duration:</span>
                    <span className="font-mono text-text-primary">{minSilenceSec}s</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1.5}
                    step={0.05}
                    value={minSilenceSec}
                    onChange={(e) => setMinSilenceSec(parseFloat(e.target.value))}
                    className="w-full h-1 bg-bg-hover rounded appearance-none cursor-pointer accent-accent-ai"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Breath Margin Padding:</span>
                    <span className="font-mono text-text-primary">{silencePaddingSec}s</span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.2}
                    step={0.02}
                    value={silencePaddingSec}
                    onChange={(e) => setSilencePaddingSec(parseFloat(e.target.value))}
                    className="w-full h-1 bg-bg-hover rounded appearance-none cursor-pointer accent-accent-ai"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Filler Word Removal Settings */}
          <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-canvas/60 p-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableFillerCut}
                  onChange={(e) => setEnableFillerCut(e.target.checked)}
                  className="rounded border-hairline text-accent-ai focus:ring-0"
                />
                <span>Remove Verbal Filler Words</span>
              </label>
              <span className="text-[10px] font-mono text-amber-400">
                {fillerCutCount} fillers found
              </span>
            </div>

            {enableFillerCut && (
              <div className="flex flex-wrap gap-1 mt-1">
                {['um', 'uh', 'like', 'you know', 'ah', 'er', 'hmm', 'actually', 'basically'].map((word) => {
                  const isSelected = selectedFillerWords.includes(word);
                  return (
                    <button
                      key={word}
                      type="button"
                      onClick={() => {
                        setSelectedFillerWords((prev) =>
                          isSelected ? prev.filter((w) => w !== word) : [...prev, word],
                        );
                      }}
                      className={`rounded px-2 py-0.5 text-[10px] border transition-all ${
                        isSelected
                          ? 'border-accent-ai bg-accent-ai/20 text-accent-ai font-medium'
                          : 'border-hairline bg-bg-surface text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      "{word}"
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detected Cuts Preview Cards */}
          {detectedCuts.length > 0 && (
            <div className="flex flex-col gap-1.5 text-[10px]">
              <span className="text-text-secondary font-medium">
                Detected Jump-Cut Timeline Locations ({detectedCuts.length}):
              </span>
              <div className="flex gap-1.5 overflow-x-auto pb-1 max-h-20 flex-wrap">
                {detectedCuts.slice(0, 8).map((cut) => (
                  <button
                    key={cut.id}
                    type="button"
                    onClick={() => useSequenceStore.getState().setPlayhead(cut.startFrame)}
                    className="flex items-center gap-1 rounded bg-bg-canvas border border-hairline px-2 py-1 hover:border-accent-ai/50 text-[9px] text-text-primary transition-all shrink-0"
                    title={`Click to seek playhead to frame ${cut.startFrame}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        cut.type === 'silence' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-mono">{formatTimecode(cut.startFrame, fps)}</span>
                    <span className="text-text-muted">({cut.durationSec}s)</span>
                  </button>
                ))}
                {detectedCuts.length > 8 && (
                  <span className="text-text-disabled self-center px-1 text-[9px]">
                    +{detectedCuts.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sequence Destination Choice */}
          <div className="flex items-center justify-between pt-1 text-[11px]">
            <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={duplicateSequenceFirst}
                onChange={(e) => setDuplicateSequenceFirst(e.target.checked)}
                className="rounded border-hairline text-accent-ai focus:ring-0"
              />
              <span>Duplicate sequence before cutting (Non-destructive)</span>
            </label>
          </div>

          {/* Execute Cut Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleApplySmartCut}
            className="w-full justify-center"
            disabled={isExecutingCut || detectedCuts.length === 0}
          >
            <span className="material-symbols-outlined text-sm">content_cut</span>
            <span>
              {isExecutingCut
                ? 'Tightening timeline...'
                : detectedCuts.length === 0
                ? 'No pauses or fillers detected'
                : `Apply Smart Cut (${detectedCuts.length} cuts • saves ${totalSavedSec}s)`}
            </span>
          </Button>
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
                onClick={() => setIsAutoCaptionsOpen(true)}
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                AI Auto-Captions (Speech-to-Text)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-sm">file_upload</span>
                Import SRT / WebVTT / ASS
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
