import { useCallback, useEffect, useState } from 'react';

import {
  RENDER_AUDIO_BITRATES,
  SEQUENCE_FPS_OPTIONS,
  hasBlockingFindings,
  matchableCanvasSize,
  narrationTrackOf,
  runPreflight,
  selectTimelineWatermarkTargets,
  type PreflightFinding,
  type RenderAcceleration,
  type RenderAudioBitrate,
  type RenderDeliveryFormat,
  type RenderEncoderInfo,
  type RenderQuality,
} from '@shared';

import { useProjectStore } from '../../../entities/project';
import { useImportedMediaStore, useSequenceStore } from '../../../entities/sequence';
import { formatIpcError } from '../../../shared/lib/formatIpcError';
import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Section } from '../../../shared/ui/Section';
import { Select } from '../../../shared/ui/Select';

import { RenderProgress } from './RenderProgress';

/**
 * S157 (owner item 17) — aspect presets. Choosing one edits the *sequence's*
 * geometry (`updateSettings` re-scales safely): aspect is a property of the
 * cut — the preview, text positions and every future export — not of one
 * render.
 */
const ASPECT_PRESETS: { id: string; label: string; width: number; height: number }[] = [
  { id: '16:9', label: '16:9 · 1920×1080', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 · 1080×1920', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 · 1080×1080', width: 1080, height: 1080 },
];

/** The resolution ladder, filtered to the sequence's own height. `0` = full. */
const RESOLUTION_LADDER = [2160, 1440, 1080, 720];

/**
 * Beta S145 — preflight, then export.
 *
 * The preflight's whole contract is **report, never silently fix**: a still
 * holding 40 seconds is honest if narration plays under it and dead air if
 * not, and only the person editing knows which. Warnings inform; blocking
 * findings stop the export, because an export missing a shot is an export the
 * user has to redo and the reason is knowable now.
 *
 * Phase D made the check *real*: it measures every source through
 * `probeSources` (the shared probe cache, so repeat checks are free), and a
 * file that fails to stat or probe lands in `missingClipIds`. Before this,
 * the missing-source case was only caught at render time.
 *
 * Every output path comes from a native save dialog. A renderer-supplied path
 * would let the renderer name any file on disk as a write target.
 */

export function RenderPanel() {
  const document = useSequenceStore((state) => state.document);
  const progress = useSequenceStore((state) => state.renderProgress);
  const setRenderProgress = useSequenceStore((state) => state.setRenderProgress);
  const storyboardReport = useSequenceStore((state) => state.storyboardReport);
  const markers = useSequenceStore((state) => state.markers);
  // S353 — an imported clip's watermark identity is its `sequence_media` row,
  // and only the pool holds the path→id map that resolves it.
  const importedMedia = useImportedMediaStore((state) => state.media);
  const loadImportedMedia = useImportedMediaStore((state) => state.load);
  const projectId = useProjectStore((state) => state.activeProjectId);
  const pushToast = useToastStore((state) => state.pushToast);
  const [findings, setFindings] = useState<PreflightFinding[] | null>(null);
  /**
   * Beta S255 — `busy` is two facts, and only one of them is this
   * component's.
   *
   * `localBusy` covers the part a render has not started yet: the preflight
   * check and the native save dialog. That genuinely belongs to this mount —
   * navigate away mid-dialog and there is nothing to come back to.
   *
   * Whether a render is *in flight* is the main process's fact, and this
   * panel used to keep it in `useState` alongside the other. Screens unmount,
   * so leaving the Timeline — which is exactly what switching project makes
   * you do — reset it to `false`: the Export button came back enabled over
   * the top of a running export, and Cancel vanished.
   */
  const [localBusy, setLocalBusy] = useState(false);
  const activeRenderSequenceId = useSequenceStore((state) => state.activeRenderSequenceId);
  const renderingThisSequence =
    document !== null && activeRenderSequenceId === document.sequence.id;
  const busy = localBusy || renderingThisSequence;
  /**
   * This sequence's progress, or nothing.
   *
   * With two projects visited in one session, "something is rendering" and
   * "*this* timeline is rendering" are different questions — and answering
   * the first as the second put one project's bar in another project's panel.
   */
  const ownProgress =
    progress !== null && progress.sequenceId === document?.sequence.id ? progress : null;
  /**
   * Beta S151 (F4) — the ducking control.
   *
   * Phase D built a real sidechain compressor and this panel hardcoded the
   * flag to `true`, so a user with a scored sequence had no way to hear their
   * music at full level. A per-render option like `draft`, so it is UI state
   * rather than a column: nothing about it needs to outlive the export.
   */
  const [duck, setDuck] = useState(true);
  /** S157 — export options, per-render UI state like `duck`. `0` height = full. */
  const [outputHeight, setOutputHeight] = useState(0);
  /**
   * S242 — the cut's own native size, learned from the same probe pass that
   * feeds preflight. `null` until a check has run: an unprobed cut has nothing
   * to offer, and guessing a canvas is worse than not offering one.
   */
  const [matchable, setMatchable] = useState<{ width: number; height: number } | null>(null);
  const [quality, setQuality] = useState<RenderQuality>('good');
  const [audioBitrate, setAudioBitrate] = useState<RenderAudioBitrate>(192);
  /**
   * S286 — delivery container, per-render UI state like `quality`. Every
   * other option still applies: the render always builds the same mp4 master
   * and converts it, so resolution/quality/ducking mean one thing across
   * formats. GIF/APNG/PNG carry no audio by nature — the Audio control
   * disables rather than pretending.
   */
  const [format, setFormat] = useState<RenderDeliveryFormat>('mp4');
  const silentFormat = format === 'gif' || format === 'apng' || format === 'png';
  /**
   * S248 — hardware encoding, per-render UI state like `quality`.
   *
   * `encoder` is what the machine actually has, asked once on mount, so the
   * control can name the accelerator rather than offering "hardware" as an
   * article of faith. `null` while the probe is in flight; a probe that finds
   * nothing leaves the control disabled with its reason showing, which is the
   * honest rendering of "this box has no GPU encoder" — not a choice that
   * silently does nothing.
   */
  const [acceleration, setAcceleration] = useState<RenderAcceleration>('auto');
  const [encoder, setEncoder] = useState<RenderEncoderInfo | null>(null);
  const updateSettings = useSequenceStore((state) => state.updateSettings);

  useEffect(() => {
    let alive = true;
    void window.api.sequence
      .getEncoder()
      .then((info) => {
        if (alive) setEncoder(info);
      })
      .catch(() => {
        // A probe that will not answer is the software floor, which is also
        // what the render falls back to — never a blocked export panel.
        if (alive) setEncoder({ encoderId: 'libx264', label: 'x264', hardware: false, hwaccelId: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * S353 — the pool, loaded here too.
   *
   * `FilesPane` loads it when the Imported tab mounts, and the export panel is
   * reachable without ever opening that tab. Without this the path→id map is
   * empty, every imported clip resolves to no watermark source, and the
   * finding silently under-counts — the failure mode a report exists to not
   * have. `load` keeps what is on screen for the same project, so this is a
   * no-op when the pane got there first.
   */
  useEffect(() => {
    if (!projectId) return;
    void loadImportedMedia(projectId);
  }, [loadImportedMedia, projectId]);

  const check = useCallback(async (): Promise<PreflightFinding[]> => {
    if (!document) return [];
    // One batched probe over every source. Cached by path+size+mtime, so the
    // cost is one stat per unchanged file — cheap enough to run on every
    // check. Text clips have no path (S154 phase 5) and cannot go missing.
    const paths = [
      ...new Set(
        document.clips
          .map((clip) => clip.filePath)
          .filter((filePath): filePath is string => filePath !== null),
      ),
    ];
    const probes = paths.length > 0 ? await window.api.sequence.probeSources(paths) : {};
    const missingClipIds = document.clips
      .filter((clip) => clip.filePath !== null && probes[clip.filePath] === null)
      .map((clip) => clip.id);
    const geometryMismatchClipIds = document.clips
      .filter((clip) => {
        if (clip.sourceKind !== 'video' || clip.filePath === null) return false;
        const probe = probes[clip.filePath];
        if (!probe?.width || !probe.height) return false;
        return probe.width !== document.sequence.width || probe.height !== document.sequence.height;
      })
      .map((clip) => clip.id);
    // S229 — the same probe pass feeds the motion-resolution guard: a still's
    // measured pixel size, keyed by clip, for §3.5's "can this source afford
    // its move" check.
    const sourceSizeByClipId: Record<string, { width: number; height: number }> = {};
    for (const clip of document.clips) {
      if (clip.sourceKind !== 'still' || clip.filePath === null) continue;
      const probe = probes[clip.filePath];
      if (probe?.width && probe.height) {
        sourceSizeByClipId[clip.id] = { width: probe.width, height: probe.height };
      }
    }

    // S242 — the remedy half of S239's finding: what the canvas would have to
    // be for it to go away. Recorded here because this is where the sizes are.
    setMatchable(
      matchableCanvasSize(Object.values(sourceSizeByClipId), {
        width: document.sequence.width,
        height: document.sequence.height,
      }),
    );

    // S353 — which pictures in this cut the app has no record of cleaning.
    //
    // Asked once for the whole cut, from stored stamps rather than by running
    // the detector: Phase 0 measured 2.7-7.9 s per still, so an inspected
    // answer would make this label cost minutes. A clip whose file the pool has
    // no record of resolves to no source at all and is simply not counted —
    // there is nothing the app could offer to do about it.
    const mediaIdByPath = new Map(importedMedia.map((file) => [file.path, file.id]));
    const watermarkRefs = selectTimelineWatermarkTargets(document.clips, mediaIdByPath);
    let uncleanedClipIds: string[] = [];
    if (watermarkRefs.length > 0) {
      const known = await window.api.watermark.cleanStatus(watermarkRefs.map((t) => t.ref));
      uncleanedClipIds = watermarkRefs
        .filter((target) => !known[`${target.ref.kind}:${target.ref.sourceId}`])
        .flatMap((target) => target.clipIds);
    }

    const result = runPreflight({
      sequence: document.sequence,
      tracks: document.tracks,
      clips: document.clips,
      missingClipIds,
      geometryMismatchClipIds,
      sourceSizeByClipId,
      uncleanedClipIds,
      // S233 — locked markers guard their ±8f windows against transitions.
      markers,
      // Beta S151 (F2) — the two inputs S145 declared and never supplied.
      //
      // Gated on the sequence actually being storyboard-assembled: a
      // free-standing timeline built from the bin has no relationship to
      // whichever episode happens to be open, and reporting its shots as
      // "not in the timeline" would be a blocking finding about a document
      // that was never meant to contain them.
      ...(document.clips.some((clip) => clip.storyShotId)
        ? {
            headingByShotId: storyboardReport.unplacedHeadingByShotId,
            staleShotIds: storyboardReport.staleShotIds,
          }
        : {}),
    });
    setFindings(result);
    return result;
  }, [document, importedMedia, markers, storyboardReport]);

  const render = useCallback(
    async (draft: boolean) => {
      if (!document) return;
      setLocalBusy(true);
      try {
        const result = await check();
        if (hasBlockingFindings(result)) {
          pushToast({ variant: 'error', message: 'Fix the blocking problems before exporting.' });
          return;
        }

        const outputPath = await window.api.sequence.chooseExportPath(
          draft ? `${document.sequence.name} (draft)` : document.sequence.name,
          // S286 — the extension is decided main-side from this; absent = mp4.
          format === 'mp4' ? undefined : format,
        );
        if (!outputPath) return;

        const rendered = await window.api.sequence.render({
          sequenceId: document.sequence.id,
          outputPath,
          draft,
          duckMusicUnderNarration: duck,
          // S157 — the panel's export options; absent fields keep the
          // pre-S157 behaviour (full size, 18/veryfast, 192k).
          outputHeight: outputHeight > 0 ? outputHeight : undefined,
          quality: quality === 'good' ? undefined : quality,
          audioBitrateKbps: audioBitrate,
          // S248 — absent would mean `'auto'` anyway; sending it explicitly
          // is what makes `'off'` expressible.
          acceleration,
          // S286 — absent means mp4, the pre-S286 output exactly.
          format: format === 'mp4' ? undefined : format,
        });
        // S248 — the result names the encoder that actually ran, which is not
        // always the one the control offered: a hardware encoder that lists
        // but will not open a session falls back, and a toast claiming NVENC
        // over an x264 render would be exactly the kind of untrue label S246
        // and S247 went and fixed.
        const via = rendered.encoder?.hardware ? ` via ${rendered.encoder.label}` : '';
        pushToast({
          variant: 'success',
          message:
            rendered.skipped.length > 0
              ? `Exported${via}, skipping ${rendered.skipped.length} clip${rendered.skipped.length === 1 ? '' : 's'} whose source is missing.`
              : `Exported${via}.`,
        });
      } catch (error) {
        pushToast({
          variant: 'error',
          message: formatIpcError(error, 'The export failed.'),
        });
      } finally {
        setLocalBusy(false);
        setRenderProgress(null);
      }
    },
    [
      acceleration,
      audioBitrate,
      check,
      document,
      duck,
      format,
      outputHeight,
      pushToast,
      quality,
      setRenderProgress,
    ],
  );

  /** S157 — the mixed bed alone, as `.m4a`. Preflight still gates it. */
  const exportAudio = useCallback(async () => {
    if (!document) return;
    setLocalBusy(true);
    try {
      const result = await check();
      if (hasBlockingFindings(result)) {
        pushToast({ variant: 'error', message: 'Fix the blocking problems before exporting.' });
        return;
      }
      const outputPath = await window.api.sequence.chooseExportPath(
        `${document.sequence.name} (audio)`,
        'm4a',
      );
      if (!outputPath) return;
      await window.api.sequence.render({
        sequenceId: document.sequence.id,
        outputPath,
        audioOnly: true,
        duckMusicUnderNarration: duck,
        audioBitrateKbps: audioBitrate,
      });
      pushToast({ variant: 'success', message: 'Audio exported.' });
    } catch (error) {
      pushToast({
        variant: 'error',
        message: formatIpcError(error, 'The audio export failed.'),
      });
    } finally {
      setLocalBusy(false);
      setRenderProgress(null);
    }
  }, [audioBitrate, check, document, duck, pushToast, setRenderProgress]);

  const exportOtio = useCallback(async () => {
    if (!document) return;
    try {
      const written = await window.api.sequence.exportOtio(document.sequence.id);
      if (written) pushToast({ variant: 'success', message: 'OpenTimelineIO file written.' });
    } catch (error) {
      pushToast({
        variant: 'error',
        message: formatIpcError(error, 'The OTIO export failed.'),
      });
    }
  }, [document, pushToast]);

  if (!document) return null;

  // Only offered when there is something to duck *and* something to duck it
  // under — a control that could not change the output would be noise. S157:
  // the duck keys off the narration-**role** track (the render's rule, same
  // `narrationTrackOf` fallback), so the checkbox needs that track populated
  // plus at least one other.
  const audioTracks = document.tracks
    .filter((track) => track.kind === 'audio')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const keyTrackId = narrationTrackOf(document.tracks)?.id;
  const canDuck =
    keyTrackId !== undefined &&
    document.clips.some((clip) => clip.trackId === keyTrackId) &&
    document.clips.some(
      (clip) =>
        clip.trackId !== keyTrackId &&
        audioTracks.some((track) => track.id === clip.trackId),
    );

  const aspectValue =
    ASPECT_PRESETS.find(
      (preset) =>
        preset.width === document.sequence.width && preset.height === document.sequence.height,
    )?.id ?? 'custom';
  const resolutions = RESOLUTION_LADDER.filter((height) => height < document.sequence.height);

  return (
    <div className="flex flex-col gap-4">
      {/* S157 (owner item 17) — the export settings. Aspect and frame rate
          edit the *sequence* (the cut's own facts); resolution, quality and
          audio bitrate are per-export. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs text-text-secondary">
        <span>Aspect</span>
        <Select
          aria-label="Sequence aspect ratio"
          size="sm"
          value={aspectValue}
          onChange={(value) => {
            if (value === 'match') {
              if (matchable) void updateSettings({ width: matchable.width, height: matchable.height });
              return;
            }
            const preset = ASPECT_PRESETS.find((entry) => entry.id === value);
            if (preset) void updateSettings({ width: preset.width, height: preset.height });
          }}
          options={[
            ...ASPECT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
            ...(aspectValue === 'custom'
              ? [
                  {
                    value: 'custom',
                    label: `Custom · ${document.sequence.width}×${document.sequence.height}`,
                  },
                ]
              : []),
            // S242 — the sources' own size, so a cut of 1376×768 Flow stills
            // has somewhere to go once preflight names the upscale. Appears
            // only after a check has measured them, and only when it would
            // actually change the canvas.
            ...(matchable
              ? [
                  {
                    value: 'match',
                    label: `Match sources · ${matchable.width}×${matchable.height}`,
                  },
                ]
              : []),
          ]}
        />
        <span>Frame rate</span>
        <Select
          aria-label="Sequence frame rate"
          size="sm"
          value={String(document.sequence.fps)}
          onChange={(value) => void updateSettings({ fps: Number(value) })}
          options={SEQUENCE_FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
        />
        {/* S286 — delivery container. The list is closed (`RENDER_DELIVERY_FORMATS`);
            everything converts from the same mp4 master after the mux. */}
        <span>Format</span>
        <Select
          aria-label="Export format"
          size="sm"
          value={format}
          onChange={(value) => setFormat(value as RenderDeliveryFormat)}
          options={[
            { value: 'mp4', label: 'MP4 video' },
            { value: 'gif', label: 'GIF animation' },
            { value: 'webm', label: 'WebM video' },
            { value: 'apng', label: 'Animated PNG' },
            { value: 'png', label: 'PNG frame sequence' },
          ]}
        />
        <span>Resolution</span>
        <Select
          aria-label="Export resolution"
          size="sm"
          value={String(outputHeight)}
          onChange={(value) => setOutputHeight(Number(value))}
          options={[
            { value: '0', label: `Full · ${document.sequence.width}×${document.sequence.height}` },
            ...resolutions.map((height) => ({ value: String(height), label: `${height}p` })),
          ]}
        />
        <span>Quality</span>
        <Select
          aria-label="Export quality"
          size="sm"
          value={quality}
          onChange={(value) => setQuality(value as RenderQuality)}
          options={[
            { value: 'good', label: 'Good — fast (CRF 18)' },
            { value: 'high', label: 'High — slow (CRF 16)' },
          ]}
        />
        {/* S248 — hardware encoding. Named, not promised: the option carries
            the encoder the probe actually opened, and a machine with none
            gets a disabled control that says so rather than a toggle whose
            two settings do the same thing. */}
        <span>Encoder</span>
        <Select
          aria-label="Export encoder"
          size="sm"
          disabled={!encoder?.hardware}
          value={encoder?.hardware ? acceleration : 'off'}
          onChange={(value) => setAcceleration(value as RenderAcceleration)}
          options={
            encoder?.hardware
              ? [
                  { value: 'auto', label: `Hardware — ${encoder.label}` },
                  { value: 'off', label: 'Software — x264' },
                ]
              : [
                  {
                    value: 'off',
                    label:
                      encoder === null
                        ? 'Checking…'
                        : 'Software — x264 (no hardware encoder found)',
                  },
                ]
          }
        />
        <span>Audio</span>
        <Select
          aria-label="Audio bitrate"
          size="sm"
          disabled={silentFormat}
          value={String(audioBitrate)}
          onChange={(value) => setAudioBitrate(Number(value) as RenderAudioBitrate)}
          options={RENDER_AUDIO_BITRATES.map((bitrate) => ({
            value: String(bitrate),
            // S286 — WebM's bed is Opus, not AAC; the label follows the truth.
            label: `${format === 'webm' ? 'Opus' : 'AAC'} ${bitrate} kbps`,
          }))}
        />
      </div>

      {canDuck ? (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={duck}
            className="accent-[var(--accent-ai)]"
            onChange={(event) => setDuck(event.target.checked)}
          />
          Duck music under narration
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void render(false)}>
          Export
        </Button>
        {/*
          The escape hatch for the preview's disclosed approximation: a real
          render at half size, where crossfades and ducking are genuinely
          present.
        */}
        <Button variant="secondary" disabled={busy} onClick={() => void render(true)}>
          Draft preview
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void check()}>
          Check
        </Button>
        {/* S157 — the mix alone, for a podcast cut or an external grade. */}
        <Button variant="ghost" disabled={busy} onClick={() => void exportAudio()}>
          Audio only
        </Button>
        {/* Hand-off to a real NLE — the phase E deliverable the OTIO-shaped
            schema existed to make cheap. */}
        <Button variant="ghost" disabled={busy} onClick={() => void exportOtio()}>
          Export .otio
        </Button>
        {busy ? (
          <Button variant="ghost" onClick={() => void window.api.sequence.cancelRender()}>
            Cancel
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-text-disabled">
        Transitions, ducking, and gamma/sharpen/vignette — including an effect clip’s — appear
        here, in the export; the preview approximates them.
      </p>

      {ownProgress ? <RenderProgress progress={ownProgress} /> : null}

      {findings ? (
        <Section title="Preflight" count={findings.length}>
          {findings.length === 0 ? (
            <p className="text-xs text-text-disabled">Nothing to report.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {findings.map((finding, index) => (
                <li
                  key={`${finding.code}-${finding.clipId ?? finding.storyShotId ?? index}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[14px] ${
                      finding.severity === 'blocking' ? 'text-accent-danger' : 'text-accent-warning'
                    }`}
                  >
                    {finding.severity === 'blocking' ? 'block' : 'warning'}
                  </span>
                  <span className="text-text-secondary">{finding.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}
