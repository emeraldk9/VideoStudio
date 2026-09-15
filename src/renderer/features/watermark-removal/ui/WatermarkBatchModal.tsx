import { useCallback, useEffect, useState } from 'react';

import { toMediaUrl } from '@shared';
import { WATERMARK_OUTPUT_MODES } from '@shared/types/watermark';
import type {
  WatermarkAccelerator,
  WatermarkEngine,
  WatermarkItemRecord,
  WatermarkOutputMode,
  WatermarkSourceRef,
} from '@shared/types/watermark';

import { useSequenceStore } from '../../../entities/sequence';
import { MODAL_IDS } from '../../../shared/config/modal-ids';
import { formatBytes } from '../../../shared/lib/format';
import { formatIpcError } from '../../../shared/lib/formatIpcError';
import { useModalStore, type WatermarkBatchSource } from '../../../shared/model/modalStore';
import { useToastStore } from '../../../shared/model/toastStore';
import { useWatermarkProgressStore } from '../../../shared/model/watermarkProgressStore';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { InfoPopover } from '../../../shared/ui/InfoPopover';
import { Modal } from '../../../shared/ui/Modal';
import { Section } from '../../../shared/ui/Section';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Select } from '../../../shared/ui/Select';
import { Switch } from '../../../shared/ui/Switch';
import { useWatermarkStore } from '../model/watermarkStore';

import { FRAME_CLASSES, RegionPicker } from './RegionPicker';

/**
 * Beta S235 — choose what to clean, where the mark is, and where the result goes.
 *
 * One pane with sections rather than a wizard. The three decisions are not
 * sequential in practice — someone adjusts the box, previews, adjusts again —
 * and stepping between panes to do that would hide the preview behind a Back
 * button at exactly the moment it is useful.
 *
 * The honest framing this UI has to keep: it cleans a *visible badge* off media
 * you own. It is not de-identification. Removing the badge does not remove
 * SynthID, and nothing here should imply otherwise.
 *
 * ## Beta S494 — the picture became the subject
 *
 * Same three decisions, rearranged around the thing the dialog is actually
 * about. Before this the settings ran down one column and the result appeared
 * *below* them as a pair of thumbnails, so the frame this tool exists to
 * inspect was the smallest, lowest thing in the dialog — and on a short window
 * it was under the fold at the moment it mattered. Now the frame is a single
 * media canvas holding the whole left side, the settings are a narrow rail
 * beside it, and the actions are pinned in a footer that a scrolling rail
 * cannot push away.
 *
 * Before/after are one canvas with a toggle rather than two images side by
 * side. At this size a pair is two small pictures of a mark a few pixels tall;
 * flipping one large frame in place is how the difference is actually seen, and
 * it is the comparison every image editor offers for the same reason.
 *
 * Three things in the old markup were invisible rather than merely plain, and
 * are worth naming so they are not reintroduced: `bg-surface-sunken`,
 * `bg-accent-primary`, `border-accent-primary`, `text-status-warning` and
 * `text-status-error` are not tokens this app has. Tailwind emits nothing for a
 * colour class with no theme entry, so the preset control had no background at
 * all, both progress bars filled with nothing, and every warning and error line
 * rendered in ordinary body text. The names here are the registered ones —
 * `bg-bg-hover`, `text-accent-warning`, `text-accent-danger`.
 */

const OUTPUT_MODE_LABELS: Record<WatermarkOutputMode, { label: string; hint: string }> = {
  derive: {
    label: 'Keep both',
    hint: 'Writes a cleaned copy alongside the original. Nothing is overwritten.',
  },
  replace: {
    label: 'Replace',
    // Beta S247 — "the original" was the wrong noun: the kept copy is whatever
    // the file was before this clean, which for an upscaled take is its `_2K`
    // derivative. Undoing the clean is the promise that holds.
    hint: 'Overwrites the file, keeping the previous version in an "originals" folder so the clean can be undone.',
  },
};

/**
 * What the fill is running on. Named in the user's terms rather than the
 * runtime's: "DirectML" is the API, "GPU" is what it means to someone deciding
 * whether this will be slow.
 */
const ACCELERATOR_LABELS: Record<WatermarkAccelerator, string> = {
  dml: 'GPU',
  coreml: 'GPU',
  cpu: 'CPU',
};

/** Beta S495 — what the preview says it did, in the user's terms. */
const ENGINE_LABELS: Record<WatermarkEngine, string> = {
  'alpha-unblend': 'removed exactly',
  lama: 'filled with Smart fill',
  removelogo: 'filled',
  delogo: 'filled with the standard fill',
};

export function WatermarkBatchModal() {
  const activeModal = useModalStore((store) => store.activeModal);
  const closeModal = useModalStore((store) => store.closeModal);
  const takeWatermarkBatchSources = useModalStore((store) => store.takeWatermarkBatchSources);
  // Beta S247 — the live batch lives in `shared/model` now, so the stage
  // buttons can show it too; the dialog is no longer its only reader.
  const progress = useWatermarkProgressStore((store) => store.progress);
  const pushToast = useToastStore((store) => store.pushToast);

  const {
    presets,
    sources,
    presetId,
    manualRect,
    outputMode,
    lossless,
    exportDir,
    preview,
    previewFrame,
    previewing,
    previewError,
    frame,
    frameAt,
    lastBatch,
    lastItems,
    startError,
    inpaint,
    modelBusy,
    modelError,
  } = useWatermarkStore();
  const {
    setPresets,
    setSources,
    addSources,
    removeSource,
    setPresetId,
    setManualRect,
    setOutputMode,
    setLossless,
    setExportDir,
    setPreview,
    setPreviewing,
    setPreviewError,
    setFrame,
    setFrameAt,
    setResult,
    setStartError,
    setInpaint,
    setModelBusy,
    setModelError,
    resetForNewBatch,
  } = useWatermarkStore();

  const open = activeModal === MODAL_IDS.WATERMARK_BATCH;
  const running = progress?.status === 'running';
  const isManual = presetId === 'manual';

  /**
   * Which side of the comparison the canvas is showing.
   *
   * Derived rather than synchronised: the state holds *which preview the
   * choice was made against*, so a new result lands on "after" — that is what
   * the press asked for — and an invalidated one falls back to the frame,
   * which is every box move, putting a manual adjustment back on the thing
   * being adjusted instead of on a stale result. An effect calling `setView`
   * would express the same rule as a cascading render, which is what
   * `react-hooks/set-state-in-effect` exists to refuse.
   */
  const [choice, setChoice] = useState<{
    view: 'before' | 'after';
    of: typeof preview;
  } | null>(null);
  const view = choice?.of === preview ? choice.view : preview ? 'after' : 'before';
  const setView = (next: 'before' | 'after') => setChoice({ view: next, of: preview });

  useEffect(() => {
    if (!open || presets.length > 0) return;
    void window.api.watermark.listPresets().then(setPresets);
  }, [open, presets.length, setPresets]);

  // Whoever opened the dialog handed its items through `modalStore`; take
  // them once. Reopening without a handoff keeps the list as it was, which is
  // what someone who closed the dialog to check something expects.
  useEffect(() => {
    if (!open) return;
    const handed = takeWatermarkBatchSources();
    if (!handed) return;
    setSources(handed);
    /**
     * Beta S241 — a batch of story takes cleans **in place**, not alongside.
     *
     * `derive` is right for the Library, where a cleaned copy becomes its own
     * row. It is wrong for a story take: the document points at
     * `take.localPath`, so a `-clean` sibling would be orphaned the moment it
     * was written — invisible to the strip, never sent to Flow as a first
     * frame, absent from the Timeline and from the export. Replacing keeps the
     * take's path valid, so every downstream stage picks the cleaned file up
     * without anything being re-pointed, and the original is backed up and
     * revertible.
     *
     * Inferred rather than passed, because it is a fact about what a story
     * take *is* rather than a preference the opener happens to hold. A mixed
     * hand-off (never produced today) keeps the safer `derive`.
     */
    if (handed.length > 0 && handed.every((source: WatermarkBatchSource) => source.kind === 'story-take')) {
      setOutputMode('replace');
      return;
    }
    /**
     * Beta S353 — and the converse, for an imported pool file: `replace` is
     * refused for it downstream, so a dialog reopened on a previous `replace`
     * choice would offer a press that can only fail. `derive` is also the
     * better answer here rather than merely the permitted one — the cleaned
     * copy gets its own `sequence_media` row and every clip in the project is
     * re-pointed at it, so the cut follows without a second gesture.
     */
    if (handed.some((source: WatermarkBatchSource) => source.kind === 'sequence-media')) {
      setOutputMode('derive');
    }
  }, [open, setSources, setOutputMode, takeWatermarkBatchSources]);

  // Re-read on every open rather than once: the model can be downloaded or
  // removed between openings, and a stale "not installed" would offer a
  // 208 MB download for a file already on disk.
  useEffect(() => {
    if (!open) return;
    void window.api.watermark.inpaintStatus().then(setInpaint);
  }, [open, setInpaint]);

  /**
   * Beta S495 — the canvas shows the first item as soon as there is one.
   *
   * S494 kept the frame from the last *preview*; this fetches one on its own,
   * so the picture is there before any cleaning has been asked for, and it
   * follows the first item and the scrub point only — never the box or the
   * preset, which is what keeps it still while a box is drawn over it.
   */
  const firstKind = sources[0]?.kind;
  const firstId = sources[0]?.sourceId;
  useEffect(() => {
    if (!open) return;
    if (!firstKind || !firstId) {
      setFrame(null);
      return;
    }
    let stale = false;
    void window.api.watermark
      .frame({ source: { kind: firstKind, sourceId: firstId }, atSeconds: frameAt })
      .then((result: any) => {
        if (!stale) setFrame(result);
      })
      .catch(() => {
        if (!stale) setFrame(null);
      });
    return () => {
      stale = true;
    };
  }, [open, firstKind, firstId, frameAt, setFrame]);

  // The scrub slider is local while it is being dragged; the store (and the
  // frame fetch behind it) sees the value once per release, not once per pixel.
  const [dragScrub, setDragScrub] = useState<number | null>(null);
  const scrub = dragScrub ?? frameAt;
  const commitScrub = () => {
    if (dragScrub === null) return;
    setFrameAt(dragScrub);
    setDragScrub(null);
  };

  const handleDownloadModel = async () => {
    setModelError(null);
    setModelBusy(true);
    try {
      setInpaint(await window.api.watermark.downloadModel());
    } catch (error) {
      setModelError(formatIpcError(error));
      // Re-read rather than trusting the local guess: a failed verification
      // leaves nothing installed, and the status is the authority on that.
      setInpaint(await window.api.watermark.inpaintStatus());
    } finally {
      setModelBusy(false);
    }
  };

  const handleRemoveModel = async () => {
    setModelError(null);
    setModelBusy(true);
    try {
      setInpaint(await window.api.watermark.removeModel());
    } finally {
      setModelBusy(false);
    }
  };

  const region = useCallback(
    () => (isManual ? ({ kind: 'manual', rect: manualRect } as const) : ({ kind: 'preset', presetId } as const)),
    [isManual, manualRect, presetId],
  );

  const asRefs = (): WatermarkSourceRef[] =>
    sources.map(({ kind, sourceId }) => ({ kind, sourceId }));

  const handleAddExternal = async () => {
    const picked = await window.api.watermark.pickExternalFiles();
    addSources(
      picked.map((file: any) => ({
        kind: 'external' as const,
        sourceId: file.token,
        label: file.label,
        mediaType: file.mediaType,
      })),
    );
  };

  const handlePickExportDir = async () => {
    setExportDir(await window.api.watermark.pickExportDir());
  };

  const presetLabel = presets.find((item) => item.id === presetId)?.label ?? presetId;

  const handlePreview = async () => {
    const first = sources[0];
    if (!first) return;
    setPreviewing(true);
    try {
      const result = await window.api.watermark.preview({
        source: { kind: first.kind, sourceId: first.sourceId },
        region: region(),
        atSeconds: frameAt,
      });
      if (!result) {
        // A null preview is a real answer — nothing detected, or no fill
        // engine could run — so it is stated rather than shown as a failure.
        setPreviewError(
          isManual
            ? 'The fill could not run on that item.'
            : presetId === 'auto'
              ? 'No known mark was detected on that item. Try drawing a box.'
              : `No ${presetLabel} was detected on that item. Try “Detect the mark”, or draw a box.`,
        );
        return;
      }
      setPreview(result);
    } catch (error) {
      setPreviewError(formatIpcError(error));
    }
  };

  /**
   * Beta S353 — imported pool files in this batch.
   *
   * `replace` is refused for them in the main process, because a
   * `sequence_media` row is a reference the user added so the app could
   * **read** a file on their own disk — read consent, not write consent. The
   * segment is disabled here so the refusal is visible before the press rather
   * than as an error after it; the IPC guard stays, because a disabled control
   * is a courtesy and not a boundary.
   */
  const importedCount = sources.filter((source) => source.kind === 'sequence-media').length;
  const replaceRefused = importedCount > 0;

  /**
   * Beta S353 — re-points the open cut at the files this batch just wrote.
   *
   * Without this a `derive` looks like it did nothing: `SequenceClip.filePath`
   * is a resolved absolute path, held directly so a Library trash cannot orphan
   * an edit, so writing `foo-clean.png` beside `foo.jpg` leaves every clip on
   * the marked file.
   *
   * Done **here** rather than only in the main process because the renderer is
   * the single writer for the open sequence's clips — `schedulePersist` writes
   * the whole list on a debounce, so a main-side relink of this sequence would
   * be overwritten by the next edit. Main still relinks project-wide, for the
   * sequences this store cannot see; the two agree because both match on the
   * old path and write the same new one.
   *
   * One `commitClips` for the whole batch, so it is **one undo step**. And no
   * commit at all when nothing matched — an empty commit would push an undo
   * entry that undoes nothing, which is worse than silence.
   */
  const relinkOpenSequence = (items: WatermarkItemRecord[]) => {
    const moved = new Map<string, string>();
    for (const item of items) {
      if (item.status !== 'done' || !item.outputPath) continue;
      if (item.outputPath === item.inputPath) continue;
      moved.set(item.inputPath, item.outputPath);
    }
    if (moved.size === 0) return;

    const document = useSequenceStore.getState().document;
    if (!document) return;
    let changed = 0;
    const next = document.clips.map((clip) => {
      const to = clip.filePath ? moved.get(clip.filePath) : undefined;
      if (!to) return clip;
      changed += 1;
      // `filePath` only. The clip's provenance — which output, which shot,
      // which take — is unchanged by a clean: what it points at moved, what it
      // came from did not, and a re-sync still has to recognise it.
      return { ...clip, filePath: to };
    });
    if (changed === 0) return;
    useSequenceStore.getState().commitClips(next);
  };

  const handleStart = async () => {
    setStartError(null);
    try {
      const batch = await window.api.watermark.startBatch({
        sources: asRefs(),
        region: region(),
        outputMode,
        exportDirToken: exportDir?.token,
        lossless: lossless || undefined,
      });
      const detail = await window.api.watermark.getBatch(batch.id);
      setResult(detail.batch as any, detail.items);
      relinkOpenSequence(detail.items);
      pushToast({
        variant: batch.failedCount > 0 ? 'warning' : 'success',
        message:
          batch.failedCount > 0
            ? `Cleaned ${batch.doneCount} of ${batch.itemCount}. ${batch.failedCount} could not be done.`
            : `Cleaned ${batch.doneCount} ${batch.doneCount === 1 ? 'item' : 'items'}.`,
      });
    } catch (error) {
      setStartError(formatIpcError(error));
    }
  };

  const handleClose = () => {
    // A running batch keeps going — it lives in main, not here — so closing is
    // just hiding the dialog, and the store keeps the progress for reopening.
    closeModal();
  };

  const skipped = lastItems.filter((item) => item.status === 'skipped').length;
  const first = sources[0];
  // Beta S495 — the fetched frame first; the last preview's "before" is the
  // fallback for the moment between opening and the fetch landing.
  const framePath = frame?.path ?? previewFrame;
  const frameUrl = framePath ? toMediaUrl(framePath) : null;
  const showingResult = view === 'after' && preview !== null;

  /**
   * Beta S495 — the box the picker shows. The user's own for a manual
   * region; for a preset, the rect the preview found, normalized against the
   * frame it was found on, so a wrong detection is visible before a batch.
   */
  const detectedRect =
    !isManual && preview && frame
      ? {
          x: preview.rect.x / frame.width,
          y: preview.rect.y / frame.height,
          w: preview.rect.width / frame.width,
          h: preview.rect.height / frame.height,
        }
      : null;
  const detection = preview?.detection ?? null;
  const detectionLabel = detection
    ? (presets.find((item) => item.id === detection.presetId)?.label ?? detection.presetId)
    : null;
  const hasVideo = sources.some((source) => source.mediaType === 'video');
  const presetHint = presets.find((item) => item.id === presetId)?.hint ?? '';

  return (
    <Modal open={open} onClose={handleClose} title="Remove watermark" size="xl" bodyScroll={false}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto md:flex-row md:gap-6 md:overflow-visible">
          {/* ------------------------------------------------------- Canvas */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {frameUrl ? (
                // Shrink-wrapped to the frame, so the ground behind a picture
                // is the picture's own and the manual box's container is
                // exactly the image it is resolved against (see RegionPicker).
                <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-bg-app">
                  {showingResult && preview ? (
                    <img
                      src={toMediaUrl(preview.afterPath)}
                      alt="The first item with the mark removed"
                      className={FRAME_CLASSES}
                    />
                  ) : isManual ? (
                    <RegionPicker
                      imageSrc={frameUrl}
                      rect={manualRect}
                      onChange={setManualRect}
                      disabled={running}
                    />
                  ) : (
                    // A preset: the frame, with the detected mark outlined on
                    // it once a preview has found one. Read-only — the
                    // detector placed it, and the point is to check it.
                    <RegionPicker
                      imageSrc={frameUrl}
                      alt="The first item before cleaning"
                      rect={detectedRect}
                      onChange={setManualRect}
                      disabled={running}
                      editable={false}
                    />
                  )}

                  {/* Which file is on screen, on the picture rather than
                      beside it — the list to the right can be scrolled
                      anywhere. */}
                  {first ? (
                    <span className="pointer-events-none absolute bottom-2 left-2 max-w-[70%] truncate rounded-[var(--radius-button)] bg-media-scrim px-1.5 py-0.5 text-[10px] text-media-text">
                      {first.label}
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="flex aspect-video max-h-[52vh] w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] bg-bg-app px-8 text-center">
                  <span aria-hidden className="material-symbols-outlined text-2xl text-text-disabled">
                    {first ? 'visibility' : 'imagesmode'}
                  </span>
                  <p className="text-xs text-text-secondary">
                    {first
                      ? 'Loading the first item…'
                      : 'Select items in the Library, or add files from this computer.'}
                  </p>
                </div>
              )}
            </div>

            {frame?.mediaType === 'video' && frame.durationSec > 0 ? (
              // Beta S495 — which frame of the clip is on the canvas. The
              // batch cleans every frame; this picks the one to judge it by.
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="whitespace-nowrap tabular-nums">Frame at {scrub.toFixed(1)} s</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, frame.durationSec - 0.1)}
                  step={0.1}
                  value={scrub}
                  disabled={running}
                  aria-label="Frame to preview"
                  className="w-full"
                  onChange={(event) => setDragScrub(Number(event.target.value))}
                  onPointerUp={commitScrub}
                  onKeyUp={commitScrub}
                  onBlur={commitScrub}
                />
              </label>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                ariaLabel="Preview view"
                value={view}
                onChange={setView}
                disabled={!frameUrl}
                options={[
                  { value: 'before', label: 'Before' },
                  // Disabled rather than hidden: the comparison is the point of
                  // the canvas, so the half that is missing should say it is
                  // missing and what would produce it.
                  { value: 'after', label: 'After', disabled: !preview },
                ]}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={running || previewing || sources.length === 0}
                onClick={() => void handlePreview()}
              >
                {previewing ? 'Checking…' : preview ? 'Preview again' : 'Preview first item'}
              </Button>
            </div>

            {previewError ? <p className="text-xs text-accent-warning">{previewError}</p> : null}
            {/* Beta S495 — what was done and, for a detected mark, where it was
                found and how sure the detector is. The batch runs the same
                engine on the same rect, so this is a statement about the
                batch, not only about the picture above. */}
            {preview ? (
              <p className="text-[11px] leading-relaxed text-text-secondary">
                {detection
                  ? `Found the ${detectionLabel} at (${detection.rect.x}, ${detection.rect.y}), match ${detection.ncc.toFixed(2)}, strength ${detection.gain.toFixed(2)} — ${detection.votes} of ${detection.frames} sampled ${detection.frames === 1 ? 'frame agrees' : 'frames agree'}. Mark ${ENGINE_LABELS[preview.engine]}.`
                  : `Mark ${ENGINE_LABELS[preview.engine]}.`}
              </p>
            ) : null}
            {/* Surfaced rather than hidden: the remover's own detector can
                still see something, and the honest response is "this one may
                need a hand-drawn box", not silence. */}
            {preview?.residualVisible ? (
              <p className="text-xs text-accent-warning">
                A trace of the mark is still detectable here. Try the manual box for this item.
              </p>
            ) : null}
            {isManual && frameUrl && !showingResult ? (
              <p className="text-[11px] text-text-disabled">
                Drag the box over the mark, then preview again to see the result.
              </p>
            ) : null}
          </div>

          {/* --------------------------------------------------------- Rail */}
          <div className="flex flex-col gap-5 md:w-[19rem] md:shrink-0 md:overflow-y-auto md:pr-0.5">
            <Section
              title="Items"
              count={sources.length}
              action={
                <>
                  <IconButton
                    size="sm"
                    icon="add"
                    label="Add files from this computer"
                    disabled={running}
                    onClick={() => void handleAddExternal()}
                  />
                  {sources.length > 0 ? (
                    <IconButton
                      size="sm"
                      icon="playlist_remove"
                      label="Clear the list"
                      disabled={running}
                      onClick={resetForNewBatch}
                    />
                  ) : null}
                </>
              }
            >
              {sources.length === 0 ? (
                <p className="text-xs leading-relaxed text-text-secondary">
                  Select items in the Library, or add files from this computer.
                </p>
              ) : (
                <ul className="flex max-h-40 flex-col overflow-y-auto">
                  {sources.map((source) => (
                    <li
                      key={source.sourceId}
                      className="flex items-center gap-1.5 rounded-[var(--radius-button)] py-0.5 pl-1.5"
                    >
                      <span
                        aria-hidden
                        className="material-symbols-outlined text-sm text-text-disabled"
                      >
                        {source.mediaType === 'video' ? 'movie' : 'image'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                        {source.label}
                      </span>
                      <IconButton
                        size="sm"
                        icon="close"
                        label={`Remove ${source.label}`}
                        disabled={running}
                        onClick={() => removeSource(source.sourceId)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Which mark">
              <Select
                aria-label="Watermark preset"
                value={presetId}
                disabled={running}
                options={presets.map((item) => ({ value: item.id, label: item.label }))}
                onChange={(value) => setPresetId(value as typeof presetId)}
              />
              {presetHint ? (
                <p className="text-xs leading-relaxed text-text-secondary">{presetHint}</p>
              ) : null}
            </Section>

            <Section title="Where the results go">
              <SegmentedControl
                ariaLabel="Where the results go"
                value={outputMode}
                onChange={setOutputMode}
                disabled={running}
                options={WATERMARK_OUTPUT_MODES.map((mode) => ({
                  value: mode,
                  label: OUTPUT_MODE_LABELS[mode].label,
                  disabled: mode === 'replace' && replaceRefused,
                }))}
              />
              <p className="text-xs leading-relaxed text-text-secondary">
                {OUTPUT_MODE_LABELS[outputMode].hint}
              </p>
              {replaceRefused ? (
                <p className="text-xs leading-relaxed text-text-disabled">
                  Replace is unavailable: {importedCount} of these{' '}
                  {importedCount === 1 ? 'is an imported file' : 'are imported files'} the app only
                  has read access to. Add them again with the + above to overwrite an original.
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-secondary">Also copy to</span>
                <div className="flex min-w-0 items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={running}
                    onClick={() => void handlePickExportDir()}
                  >
                    <span className="max-w-[8rem] truncate">{exportDir?.label ?? 'Choose…'}</span>
                  </Button>
                  {exportDir ? (
                    <IconButton
                      size="sm"
                      icon="close"
                      label="Stop copying to that folder"
                      disabled={running}
                      onClick={() => setExportDir(null)}
                    />
                  ) : null}
                </div>
              </div>

              {/* Only when the batch actually holds a video — for a page of
                  stills it is a control that can change nothing. */}
              {hasVideo ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary">
                    Lossless video
                    <span className="block text-[11px] text-text-disabled">Much larger files</span>
                  </span>
                  <Switch
                    label="Lossless video"
                    checked={lossless}
                    disabled={running}
                    onChange={() => setLossless(!lossless)}
                  />
                </div>
              ) : null}
            </Section>

            {inpaint ? (
              <Section
                title="Smart fill"
                action={
                  <InfoPopover label="About smart fill">
                    Reconstructs what was behind the mark instead of smearing the edges inward. Used
                    only where the exact removal does not apply — a hand-drawn box, or an item it
                    declined. Everything runs on this computer.
                  </InfoPopover>
                }
              >
                {!inpaint.runtimeAvailable ? (
                  // Stated rather than hidden: on a platform with no runtime the
                  // section explains why the option is missing instead of the
                  // option silently not existing.
                  <p className="text-xs leading-relaxed text-text-secondary">
                    Not available on this machine. Batches use the standard fill instead.
                  </p>
                ) : inpaint.model.installed ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-secondary">
                      {inpaint.accelerator
                        ? `Ready · ${ACCELERATOR_LABELS[inpaint.accelerator]}`
                        : 'Ready'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={modelBusy || running}
                      onClick={() => void handleRemoveModel()}
                    >
                      Remove · {formatBytes(inpaint.model.sizeBytes)}
                    </Button>
                  </div>
                ) : inpaint.download.state === 'downloading' ||
                  inpaint.download.state === 'verifying' ? (
                  <div className="flex flex-col gap-1">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-bg-hover">
                      <div
                        className="h-full bg-text-primary transition-[width] duration-200"
                        style={{
                          width: `${Math.round(
                            (inpaint.download.receivedBytes /
                              Math.max(1, inpaint.download.totalBytes)) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-secondary">
                        {inpaint.download.state === 'verifying'
                          ? 'Checking the download…'
                          : `${formatBytes(inpaint.download.receivedBytes)} of ${formatBytes(
                              inpaint.download.totalBytes,
                            )}`}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-text-secondary hover:text-text-primary"
                        onClick={() => void window.api.watermark.cancelModelDownload()}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={modelBusy || running}
                        onClick={() => void handleDownloadModel()}
                      >
                        {modelBusy
                          ? 'Downloading…'
                          : `Download · ${formatBytes(inpaint.model.sizeBytes)}`}
                      </Button>
                    </div>
                    {/* The size, the host and the licence, before the bytes
                        move — a 208 MB fetch from a third party should be an
                        informed choice, not a surprise. */}
                    <p className="text-[11px] leading-relaxed text-text-disabled">
                      One-time download from {inpaint.model.sourceHost} · {inpaint.model.license} ·
                      verified against a known checksum before it is used.
                    </p>
                  </div>
                )}

                {inpaint.download.error ? (
                  <p className="text-xs text-accent-warning">{inpaint.download.error}</p>
                ) : null}
                {modelError ? <p className="text-xs text-accent-danger">{modelError}</p> : null}
              </Section>
            ) : null}
          </div>
        </div>

        {/* --------------------------------------------------------- Footer */}
        <div className="mt-5 flex shrink-0 items-end justify-between gap-4 border-t border-hairline pt-4">
          <div className="flex min-w-0 flex-col gap-1">
            {progress ? (
              <div className="flex items-center gap-2">
                <div className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-bg-hover">
                  <div
                    className="h-full bg-text-primary transition-[width] duration-200"
                    style={{ width: `${Math.round(progress.progress * 100)}%` }}
                  />
                </div>
                <span className="min-w-0 truncate text-xs text-text-secondary">
                  {progress.doneCount} of {progress.itemCount} done
                  {progress.failedCount > 0 ? `, ${progress.failedCount} failed` : ''}
                  {progress.currentLabel ? ` — ${progress.currentLabel}` : ''}
                </span>
              </div>
            ) : null}

            {lastBatch && !running ? (
              <p className="text-xs text-text-secondary">
                {lastBatch.doneCount} cleaned
                {lastBatch.failedCount > 0 ? `, ${lastBatch.failedCount} failed` : ''}
                {skipped > 0 ? `, ${skipped} had no mark to remove` : ''}.
              </p>
            ) : null}

            {startError ? <p className="text-xs text-accent-danger">{startError}</p> : null}

            <p className="text-[11px] leading-relaxed text-text-disabled">
              For media you own or generated. Removing the visible badge does not remove an invisible
              watermark such as SynthID, and provenance metadata is preserved.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {running ? (
              <Button variant="danger" onClick={() => void window.api.watermark.cancelBatch()}>
                Stop
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={handleClose}>
                  Close
                </Button>
                <Button disabled={sources.length === 0} onClick={() => void handleStart()}>
                  {sources.length === 0
                    ? 'Clean'
                    : `Clean ${sources.length} ${sources.length === 1 ? 'item' : 'items'}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
