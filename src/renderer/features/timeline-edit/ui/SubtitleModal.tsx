import { useMemo, useRef, useState } from 'react';

import {
  applySubtitleCasing,
  CAPTION_STYLE_PRESETS,
  cuesToSequenceClips,
  formatSecondsToSRTTimestamp,
  formatTimecode,
  framesToSeconds,
  isTextTrack,
  parseSubtitleContent,
  timelineClipsToSRT,
  timelineClipsToWebVTT,
  type CaptionPresetId,
  type SequenceDocument,
  type SubtitleCasing,
  type SubtitleCue,
} from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { Modal } from '../../../shared/ui/Modal';
import { ensureTextTrack } from '../../timeline-media/lib/ensure-free-track';

export interface SubtitleModalProps {
  open: boolean;
  document: SequenceDocument;
  fps: number;
  onClose: () => void;
  initialTrackId?: string | null;
}

export function SubtitleModal({
  open,
  document,
  fps,
  onClose,
  initialTrackId,
}: SubtitleModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');

  // --- Import State ---
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [targetTrackChoice, setTargetTrackChoice] = useState<string>(initialTrackId ?? 'new_text');
  const [timingMode, setTimingMode] = useState<'sequence_zero' | 'playhead' | 'custom'>('sequence_zero');
  const [customOffsetSeconds, setCustomOffsetSeconds] = useState<number>(0);
  const [stylePreset, setStylePreset] = useState<CaptionPresetId>('modern');
  const [textCasing, setTextCasing] = useState<SubtitleCasing>('as-is');
  const [isImporting, setIsImporting] = useState(false);

  // --- Export State ---
  const [exportTrackId, setExportTrackId] = useState<string>(initialTrackId ?? 'all');
  const [exportFormat, setExportFormat] = useState<'srt' | 'vtt'>('srt');
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse cues live from raw text
  const parsedCues: SubtitleCue[] = useMemo(() => {
    return parseSubtitleContent(rawText);
  }, [rawText]);

  // Video and Text tracks available for targeting
  const videoAndTextTracks = useMemo(() => {
    return document.tracks.filter((t) => t.kind === 'video');
  }, [document.tracks]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content || '');
    };
    reader.readAsText(file);
  };

  // Handle Drag & Drop on file zone
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content || '');
    };
    reader.readAsText(file);
  };

  // Execute Import
  const handleImport = async () => {
    if (parsedCues.length === 0) return;
    setIsImporting(true);

    try {
      let resolvedTrackId = targetTrackChoice;

      // Create new text lane if requested
      if (resolvedTrackId === 'new_text') {
        const mintedId = await ensureTextTrack();
        if (!mintedId) return;
        resolvedTrackId = mintedId;
      }

      const state = useSequenceStore.getState();
      if (!state.document) return;

      // Calculate frame offset
      let offsetFrames = 0;
      if (timingMode === 'playhead') {
        offsetFrames = currentPlayheadFrame();
      } else if (timingMode === 'custom') {
        offsetFrames = Math.round(customOffsetSeconds * fps);
      }

      // Convert cues to clips
      const { clips: newClips } = cuesToSequenceClips(parsedCues, {
        targetTrackId: resolvedTrackId,
        sequenceId: state.document.sequence.id,
        fps,
        offsetFrames,
        stylePreset,
        textCasing,
        colorLabel: 'violet',
        mintId: () => crypto.randomUUID(),
      });

      // Commit to sequence store
      state.commitClips([...state.document.clips, ...newClips]);
      state.select(newClips.map((c) => c.id));
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  // Generate exported subtitle text
  const exportedContent = useMemo(() => {
    const selectedTrack = exportTrackId === 'all' ? undefined : exportTrackId;
    if (exportFormat === 'srt') {
      return timelineClipsToSRT(document.clips, fps, selectedTrack);
    }
    return timelineClipsToWebVTT(document.clips, fps, selectedTrack);
  }, [document.clips, fps, exportTrackId, exportFormat]);

  const exportClipCount = useMemo(() => {
    return document.clips.filter(
      (c) =>
        c.sourceKind === 'text' &&
        (exportTrackId === 'all' || c.trackId === exportTrackId) &&
        Boolean(c.effects?.text?.text?.trim()),
    ).length;
  }, [document.clips, exportTrackId]);

  // Copy to clipboard
  const handleCopyExport = async () => {
    if (!exportedContent) return;
    try {
      await navigator.clipboard.writeText(exportedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Download subtitle file
  const handleDownloadExport = () => {
    if (!exportedContent) return;
    const blob = new Blob([exportedContent], {
      type: exportFormat === 'srt' ? 'text/plain;charset=utf-8' : 'text/vtt;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    const safeTitle = (document.sequence.name || 'sequence').replace(/[^\w-]/g, '_');
    link.href = url;
    link.download = `${safeTitle}_subtitles.${exportFormat}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-[var(--accent-ai)]">
            closed_caption
          </span>
          <span className="font-semibold text-text-primary">Subtitles & Captions</span>
        </div>
      }
      subtitle="Ingest industry-standard .srt / .vtt caption files or export timeline subtitles"
    >
      <div className="flex flex-col gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-hairline pb-2.5">
          <button
            type="button"
            className={`flex items-center gap-2 rounded-card px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'import'
                ? 'bg-[var(--accent-ai)]/15 text-[var(--accent-ai)] border border-[var(--accent-ai)]/30'
                : 'text-text-muted hover:bg-bg-card hover:text-text-primary'
            }`}
            onClick={() => setActiveTab('import')}
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>
            Import Subtitles (.SRT / .VTT)
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 rounded-card px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'export'
                ? 'bg-[var(--accent-ai)]/15 text-[var(--accent-ai)] border border-[var(--accent-ai)]/30'
                : 'text-text-muted hover:bg-bg-card hover:text-text-primary'
            }`}
            onClick={() => setActiveTab('export')}
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export Captions
          </button>
        </div>

        {/* --- TAB 1: IMPORT --- */}
        {activeTab === 'import' && (
          <div className="flex flex-col gap-4">
            {/* Input Selection Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 rounded-card border border-hairline bg-bg-canvas p-0.5">
                <button
                  type="button"
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    inputMode === 'file'
                      ? 'bg-bg-card text-text-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  onClick={() => setInputMode('file')}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    inputMode === 'paste'
                      ? 'bg-bg-card text-text-primary shadow-xs'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  onClick={() => setInputMode('paste')}
                >
                  Paste Text
                </button>
              </div>

              {parsedCues.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-card border border-emerald-500/20">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {parsedCues.length} subtitle cues parsed
                </div>
              )}
            </div>

            {/* Input Area */}
            {inputMode === 'file' ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-hairline bg-bg-canvas/50 p-6 text-center transition hover:border-[var(--accent-ai)]/60 hover:bg-bg-card"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt,.vtt,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <span className="material-symbols-outlined text-3xl text-text-muted">
                  subtitles
                </span>
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {fileName ? (
                      <span className="text-[var(--accent-ai)]">{fileName}</span>
                    ) : (
                      'Click to browse or drop an .srt or .vtt file here'
                    )}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Supports SubRip (.srt), WebVTT (.vtt), and raw text timestamps
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`1\n00:00:01,000 --> 00:00:03,500\nPaste SubRip or WebVTT content here...`}
                  rows={5}
                  className="w-full rounded-card border border-hairline bg-bg-canvas p-2.5 font-mono text-xs text-text-primary focus:border-[var(--accent-ai)] focus:outline-none"
                />
              </div>
            )}

            {/* Ingest Configuration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 rounded-card border border-hairline bg-bg-canvas/40 p-3.5">
              {/* Target Track */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Target Text Lane</label>
                <select
                  value={targetTrackChoice}
                  onChange={(e) => setTargetTrackChoice(e.target.value)}
                  className="h-8 rounded-card border border-hairline bg-bg-card px-2 text-xs text-text-primary focus:border-[var(--accent-ai)] focus:outline-none"
                >
                  <option value="new_text">+ Create new dedicated Subtitles lane</option>
                  {videoAndTextTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name} {isTextTrack(track) ? '(Text Lane)' : '(Video Track)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timing Placement */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Timing Placement</label>
                <div className="flex items-center gap-2">
                  <select
                    value={timingMode}
                    onChange={(e) => setTimingMode(e.target.value as any)}
                    className="h-8 flex-1 rounded-card border border-hairline bg-bg-card px-2 text-xs text-text-primary focus:border-[var(--accent-ai)] focus:outline-none"
                  >
                    <option value="sequence_zero">Sequence Start (00:00:00:00)</option>
                    <option value="playhead">
                      Playhead Position ({formatTimecode(currentPlayheadFrame(), fps)})
                    </option>
                    <option value="custom">Custom Offset (seconds)</option>
                  </select>
                  {timingMode === 'custom' && (
                    <input
                      type="number"
                      step={0.5}
                      value={customOffsetSeconds}
                      onChange={(e) => setCustomOffsetSeconds(parseFloat(e.target.value) || 0)}
                      className="h-8 w-20 rounded-card border border-hairline bg-bg-card px-2 text-xs text-text-primary focus:border-[var(--accent-ai)] focus:outline-none"
                      placeholder="0.0s"
                    />
                  )}
                </div>
              </div>

              {/* Caption Style Preset */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Caption Visual Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CAPTION_STYLE_PRESETS) as CaptionPresetId[]).map((key) => {
                    const preset = CAPTION_STYLE_PRESETS[key];
                    const selected = stylePreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStylePreset(key)}
                        className={`flex flex-col items-start rounded-card border p-2 text-left transition ${
                          selected
                            ? 'border-[var(--accent-ai)] bg-[var(--accent-ai)]/10'
                            : 'border-hairline bg-bg-card/60 hover:bg-bg-card'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="text-xs font-medium text-text-primary">
                            {preset.label}
                          </span>
                          {selected && (
                            <span className="material-symbols-outlined text-xs text-[var(--accent-ai)]">
                              check
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted line-clamp-1 mt-0.5">
                          {preset.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Casing */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Text Casing</label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'as-is', label: 'As-Is', desc: 'Original casing' },
                      { id: 'uppercase', label: 'UPPERCASE', desc: 'ALL CAPS' },
                      { id: 'titlecase', label: 'Title Case', desc: 'Capitalize Words' },
                      { id: 'sentencecase', label: 'Sentence case', desc: 'First letter capital' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTextCasing(opt.id)}
                      className={`flex flex-col items-start rounded-card border p-2 text-left transition ${
                        textCasing === opt.id
                          ? 'border-[var(--accent-ai)] bg-[var(--accent-ai)]/10'
                          : 'border-hairline bg-bg-card/60 hover:bg-bg-card'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-medium text-text-primary">{opt.label}</span>
                        {textCasing === opt.id && (
                          <span className="material-symbols-outlined text-xs text-[var(--accent-ai)]">
                            check
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-text-muted line-clamp-1 mt-0.5">
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Preview of Parsed Cues */}
            {parsedCues.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-text-muted">
                  <span>Cues Preview ({parsedCues.length})</span>
                  <span>
                    Total Duration:{' '}
                    {formatSecondsToSRTTimestamp(
                      parsedCues[parsedCues.length - 1].endSeconds - parsedCues[0].startSeconds,
                    ).slice(3, 8)}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-card border border-hairline bg-bg-canvas">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-bg-card border-b border-hairline text-text-muted">
                      <tr>
                        <th className="py-1.5 px-2.5 w-12">#</th>
                        <th className="py-1.5 px-2.5 w-24">In</th>
                        <th className="py-1.5 px-2.5 w-24">Out</th>
                        <th className="py-1.5 px-2.5">Subtitle Text</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {parsedCues.slice(0, 50).map((cue) => (
                        <tr key={cue.index} className="hover:bg-bg-card/50">
                          <td className="py-1.5 px-2.5 font-mono text-text-muted">{cue.index}</td>
                          <td className="py-1.5 px-2.5 font-mono text-text-muted">
                            {formatSecondsToSRTTimestamp(cue.startSeconds).slice(3, 11)}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono text-text-muted">
                            {formatSecondsToSRTTimestamp(cue.endSeconds).slice(3, 11)}
                          </td>
                          <td className="py-1.5 px-2.5 text-text-primary">
                            {applySubtitleCasing(cue.text, textCasing)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedCues.length > 50 && (
                    <div className="p-2 text-center text-xs text-text-muted bg-bg-card/40">
                      Showing first 50 of {parsedCues.length} cues...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-hairline pt-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={parsedCues.length === 0 || isImporting}
                onClick={handleImport}
                className="gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {isImporting
                  ? 'Importing...'
                  : `Import ${parsedCues.length} Captions to Timeline`}
              </Button>
            </div>
          </div>
        )}

        {/* --- TAB 2: EXPORT --- */}
        {activeTab === 'export' && (
          <div className="flex flex-col gap-4">
            {/* Export Configuration Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 rounded-card border border-hairline bg-bg-canvas/40 p-3.5">
              {/* Select Source Track */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Export Track</label>
                <select
                  value={exportTrackId}
                  onChange={(e) => setExportTrackId(e.target.value)}
                  className="h-8 rounded-card border border-hairline bg-bg-card px-2 text-xs text-text-primary focus:border-[var(--accent-ai)] focus:outline-none"
                >
                  <option value="all">All Text / Caption Tracks</option>
                  {videoAndTextTracks
                    .filter((t) => isTextTrack(t))
                    .map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.name} (Text Track)
                      </option>
                    ))}
                </select>
              </div>

              {/* Format selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Export File Format</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('srt')}
                    className={`flex-1 rounded-card border py-1.5 px-3 text-xs font-medium transition ${
                      exportFormat === 'srt'
                        ? 'border-[var(--accent-ai)] bg-[var(--accent-ai)]/10 text-[var(--accent-ai)]'
                        : 'border-hairline bg-bg-card text-text-muted hover:text-text-primary'
                    }`}
                  >
                    SubRip (.srt)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('vtt')}
                    className={`flex-1 rounded-card border py-1.5 px-3 text-xs font-medium transition ${
                      exportFormat === 'vtt'
                        ? 'border-[var(--accent-ai)] bg-[var(--accent-ai)]/10 text-[var(--accent-ai)]'
                        : 'border-hairline bg-bg-card text-text-muted hover:text-text-primary'
                    }`}
                  >
                    WebVTT (.vtt)
                  </button>
                </div>
              </div>
            </div>

            {/* Captions Summary */}
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{exportClipCount} caption clips detected on selected track</span>
              <span>Format: {exportFormat.toUpperCase()}</span>
            </div>

            {/* Code / Text Output Preview */}
            <div className="relative">
              <textarea
                readOnly
                value={exportedContent || 'No text captions found on the selected track.'}
                rows={10}
                className="w-full rounded-card border border-hairline bg-bg-canvas p-3 font-mono text-xs text-text-primary focus:outline-none select-all"
              />
              {exportedContent && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyExport}
                    className="flex items-center gap-1 rounded bg-bg-card/90 border border-hairline px-2.5 py-1 text-xs font-medium text-text-primary shadow hover:bg-bg-card transition"
                  >
                    <span className="material-symbols-outlined text-xs">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>

            {/* Export Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-hairline pt-3">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="primary"
                disabled={!exportedContent}
                onClick={handleDownloadExport}
                className="gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Download Subtitle File (.{exportFormat})
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
