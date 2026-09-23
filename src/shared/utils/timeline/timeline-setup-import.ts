import {
  CLIP_TRANSITIONS,
  MARKER_COLORS,
  quantizeTransitionFrames,
  type ClipTransition,
  type MarkerColor,
  type SequenceClip,
  type SequenceTrack,
} from '../../types/sequence';
import {
  FLASH_FRAMES_MAX,
  type ClipColorFilters,
  type ClipTransform,
  type ClipTransitionParams,
  type ClipVideoFade,
  type TextContent,
} from './effects';
import { type ClipKeyframe } from './keyframes';
import { type WhiteboardSettings } from './whiteboard';
import { secondsToFrames } from './frames';
import {
  MAX_MOTION_RATE_PCT_PER_SEC,
  MIN_MOTION_RATE_PCT_PER_SEC,
  MOTION_DIRECTIONS,
  MOTION_PRESETS,
  MOTION_REGISTER_NAMES,
  type ClipMotion,
  type MotionPresetName,
} from './motion';

import { normalizeHeading } from './scene-breakdown';
import { normalizeKey, parseSecondsCell, sniffDelimiter, splitCsvLine } from './still-duration-import';

/** `normalizeKey` folds spaces and hyphens; setup columns fold underscores too, so `transition_in`, `transition-in` and `transitionIn` are one name. */
function foldKey(value: string): string {
  return normalizeKey(value).replace(/_/g, '');
}

/** A cell as display/parse text: strings and numbers verbatim, anything else empty — never `[object Object]`. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Beta S231 — the timeline setup import: durations, transitions and motion
 * for the clips already on the spine, from one JSON or CSV file.
 *
 * A strict **superset of the S222 durations importer**: every file that
 * imports today still parses here and means the same thing — an episode file
 * carrying only `durationSeconds` produces duration-only patches. The new
 * columns are silence when absent (an absent column is not an instruction to
 * reset), reported when wrong (an unknown preset is an error naming the row,
 * never a coerced default), and clamped *loudly* when out of range (the
 * clamp count rides the plan summary — silent clamping is what makes a user
 * believe the file was honoured).
 *
 * Same shape discipline as its S222 host: pure text-in/rows-out, no `fs`
 * and no IPC, matching performed in front of the user, first-writer-wins.
 */

// ------------------------------------------------------------------ parsing

export interface TimelineSetupRow {
  /** Whatever the file offered as the key — a shot id, a file name, a heading, or an ordinal. */
  key: string;
  /** A separate media-file column, when present. */
  file?: string;
  /** A separate heading column, when present. */
  heading?: string;
  /** 1-based position or stated ordinal. */
  order?: number;
  /** 1-based position in the file, for the "row 12" in an error. */
  line: number;

  seconds?: number;
  startSeconds?: number;
  startFrames?: number;
  trackId?: string;
  trackName?: string;
  transitionIn?: ClipTransition;
  transitionFrames?: number;
  transitionOut?: ClipTransition;
  transitionOutFrames?: number;
  transitionParams?: ClipTransitionParams;
  motion?: ClipMotion;
  audioOffsetFrames?: number;

  // Sketches & Effects
  whiteboard?: WhiteboardSettings;
  filters?: ClipColorFilters;
  transform?: ClipTransform;
  speed?: number;
  text?: TextContent;
  videoFade?: ClipVideoFade;
  gainDb?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  sourceAudioEnabled?: boolean;
  duckExempt?: boolean;
  keyframes?: ClipKeyframe[];
}

/** S233 — one marker as the file stated it. `frame` wins over `seconds` when both appear. */
export interface TimelineSetupMarker {
  frame?: number;
  seconds?: number;
  name: string;
  color?: MarkerColor;
  locked: boolean;
  notes?: string;
  line: number;
}

export interface TimelineSetupParse {
  rows: TimelineSetupRow[];
  /** Markers stated by the file. Merged additively at apply time. */
  markers: TimelineSetupMarker[];
  /** Tracks stated by the file (v2 Full JSON). */
  tracks?: SequenceTrack[];
  /** Sequence metadata stated by the file (v2 Full JSON). */
  sequence?: {
    id?: string;
    name?: string;
    fps?: number;
    width?: number;
    height?: number;
    spineTrackId?: string | null;
  };
  /** Rows the file stated and this could not use, already phrased for display. */
  errors: string[];
  /** Values honoured after adjustment (clamps, quantisation) — aggregated. */
  notes: string[];
  format: 'json' | 'csv';
  isFullTimeline?: boolean;
}

const ID_KEYS = ['id', 'shotid', 'shot', 'shot_id', 'clip', 'clipid', 'key'];
const FILE_KEYS = ['file', 'filename', 'media', 'source'];
const HEADING_KEYS = ['heading', 'slugline', 'scene', 'title', 'label'];
const SECONDS_KEYS = ['seconds', 'duration', 'durationseconds', 'durationsec', 'secs', 'length'];
const TRANSITION_IN_KEYS = ['transition', 'transitionin', 'transitiontype'];
const TRANSITION_FRAMES_KEYS = ['transitionframes', 'transitionlength'];
const TRANSITION_OUT_KEYS = ['transitionout'];
const TRANSITION_OUT_FRAMES_KEYS = ['transitionoutframes'];
const TRANSITION_PARAMS_KEYS = ['transitionparams', 'params'];
const MOTION_PRESET_KEYS = ['motion', 'motionpreset'];
const MOTION_REGISTER_KEYS = ['motionregister', 'register'];
const MOTION_RATE_KEYS = ['motionrate', 'rate', 'ratepctpersec'];
const MOTION_DIRECTION_KEYS = ['motiondirection', 'direction'];
const MOTION_POINT_X_KEYS = ['motionpointx', 'pointx'];
const MOTION_POINT_Y_KEYS = ['motionpointy', 'pointy'];
const MOTION_SEED_KEYS = ['motionseed', 'seed'];
const AUDIO_OFFSET_KEYS = ['audiooffsetframes', 'audiooffset', 'jl', 'splitedit'];

/** A transition name however the file spells it: `Blur dissolve`, `blur-dissolve`, `blurDissolve`. */
function parseTransitionName(raw: unknown): ClipTransition | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const wanted = normalizeKey(raw).replace(/_/g, '');
  if (wanted === 'dissolve') return 'crossfade';
  return CLIP_TRANSITIONS.find((name) => name.replace(/_/g, '') === wanted);
}

function parseMotionPresetName(raw: unknown): MotionPresetName | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const wanted = normalizeKey(raw).replace(/_/g, '');
  return MOTION_PRESETS.find((name) => name.replace(/_/g, '') === wanted);
}

function parseNumberCell(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

/** Mutable clamp tallies, folded into `notes` at the end of a parse. */
interface Adjustments {
  ratesClamped: number;
  framesQuantised: number;
  offsetsClamped: number;
}

/**
 * One record's setup fields, shared by the JSON and CSV paths so the two
 * formats cannot drift. `get` abstracts "value under any of these keys".
 */
function readSetupFields(
  get: (keys: string[]) => unknown,
  label: string,
  errors: string[],
  adjust: Adjustments,
): Omit<TimelineSetupRow, 'key' | 'line' | 'file' | 'heading'> | null {
  const row: Omit<TimelineSetupRow, 'key' | 'line' | 'file' | 'heading'> = {};

  const rawSeconds = get(SECONDS_KEYS);
  if (rawSeconds !== undefined && asText(rawSeconds).trim() !== '') {
    const seconds = parseSecondsCell(rawSeconds);
    if (seconds === undefined) {
      errors.push(`${label} has no usable duration.`);
      return null;
    }
    row.seconds = seconds;
  }

  for (const [keys, field, framesField] of [
    [TRANSITION_IN_KEYS, 'transitionIn', 'transitionFrames'],
    [TRANSITION_OUT_KEYS, 'transitionOut', 'transitionOutFrames'],
  ] as const) {
    const raw = get(keys);
    if (raw === undefined || asText(raw).trim() === '') continue;
    const transition = parseTransitionName(raw);
    if (!transition) {
      errors.push(`${label}: “${asText(raw)}” is not a transition.`);
      return null;
    }
    row[field] = transition;
    const framesRaw = parseNumberCell(
      get(field === 'transitionIn' ? TRANSITION_FRAMES_KEYS : TRANSITION_OUT_FRAMES_KEYS),
    );
    if (framesRaw !== undefined && transition !== 'cut') {
      const quantised =
        transition === 'flash_frame'
          ? Math.min(FLASH_FRAMES_MAX, Math.max(1, Math.round(framesRaw)))
          : quantizeTransitionFrames(framesRaw);
      if (quantised !== Math.round(framesRaw)) adjust.framesQuantised += 1;
      row[framesField] = quantised;
    }
  }

  const paramsRaw = get(TRANSITION_PARAMS_KEYS);
  if (paramsRaw !== undefined) {
    const params = parseTransitionParams(paramsRaw, label, errors);
    if (params === null) return null;
    if (params) row.transitionParams = params;
  }

  let presetRaw = get(MOTION_PRESET_KEYS);
  let motionGet = get;
  if (presetRaw && typeof presetRaw === 'object' && !Array.isArray(presetRaw)) {
    // The JSON object form: `"motion": { "preset": ..., "register": ... }` —
    // the exporter's own shape. Subfields resolve inside the object; the
    // `point` object is flattened onto the same keyspace.
    const sub = new Map<string, unknown>();
    for (const [name, value] of Object.entries(presetRaw as Record<string, unknown>)) {
      sub.set(foldKey(name), value);
    }
    const point = sub.get('point');
    if (point && typeof point === 'object' && !Array.isArray(point)) {
      const coords = point as Record<string, unknown>;
      sub.set('pointx', coords.x);
      sub.set('pointy', coords.y);
    }
    motionGet = (keys: string[]): unknown => {
      const found = keys.find((name) => sub.get(name) !== undefined);
      return found === undefined ? undefined : sub.get(found);
    };
    presetRaw = sub.get('preset');
  }
  if (presetRaw !== undefined && asText(presetRaw).trim() !== '') {
    const preset = parseMotionPresetName(presetRaw);
    if (!preset) {
      errors.push(`${label}: “${asText(presetRaw)}” is not a motion preset.`);
      return null;
    }
    const motion: ClipMotion = { preset };
    const registerRaw = motionGet(MOTION_REGISTER_KEYS);
    if (registerRaw !== undefined && asText(registerRaw).trim() !== '') {
      const register = MOTION_REGISTER_NAMES.find((name) => name === foldKey(asText(registerRaw)));
      if (!register) {
        errors.push(`${label}: “${asText(registerRaw)}” is not a motion register.`);
        return null;
      }
      motion.register = register;
    }
    const rate = parseNumberCell(motionGet(MOTION_RATE_KEYS));
    if (rate !== undefined) {
      const clamped = Math.min(
        MAX_MOTION_RATE_PCT_PER_SEC,
        Math.max(MIN_MOTION_RATE_PCT_PER_SEC, rate),
      );
      if (clamped !== rate) adjust.ratesClamped += 1;
      motion.ratePctPerSec = clamped;
    }
    const directionRaw = motionGet(MOTION_DIRECTION_KEYS);
    if (directionRaw !== undefined && asText(directionRaw).trim() !== '') {
      const direction = MOTION_DIRECTIONS.find(
        (name) => name.replace(/_/g, '') === foldKey(asText(directionRaw)),
      );
      if (!direction) {
        errors.push(`${label}: “${asText(directionRaw)}” is not a drift direction.`);
        return null;
      }
      motion.direction = direction;
    }
    const pointX = parseNumberCell(motionGet(MOTION_POINT_X_KEYS));
    const pointY = parseNumberCell(motionGet(MOTION_POINT_Y_KEYS));
    if (pointX !== undefined || pointY !== undefined) {
      motion.point = {
        x: Math.min(1, Math.max(0, pointX ?? 0.5)),
        y: Math.min(1, Math.max(0, pointY ?? 0.5)),
      };
    }
    const seed = parseNumberCell(motionGet(MOTION_SEED_KEYS));
    if (seed !== undefined) motion.seed = Math.max(0, Math.min(0xffffffff, Math.round(seed)));
    row.motion = motion;
  }

  const offset = parseNumberCell(get(AUDIO_OFFSET_KEYS));
  if (offset !== undefined) {
    const clamped = Math.min(48, Math.max(-48, Math.round(offset)));
    if (clamped !== Math.round(offset)) adjust.offsetsClamped += 1;
    row.audioOffsetFrames = clamped;
  }

  const startSec = parseNumberCell(get(['startseconds', 'startsec', 'start', 'time', 'timestamp']));
  if (startSec !== undefined) row.startSeconds = startSec;
  const startFrames = parseNumberCell(get(['startframes', 'startframe']));
  if (startFrames !== undefined) row.startFrames = Math.max(0, Math.round(startFrames));

  const trackId = asText(get(['trackid', 'track']));
  if (trackId) row.trackId = trackId;
  const trackName = asText(get(['trackname', 'lane']));
  if (trackName) row.trackName = trackName;

  // Whiteboard / sketches
  const whiteboardRaw = get(['whiteboard', 'sketch', 'handdrawn', 'whiteboardsettings']);
  if (whiteboardRaw && typeof whiteboardRaw === 'object') {
    row.whiteboard = whiteboardRaw as WhiteboardSettings;
  }

  // Filters
  const filtersRaw = get(['filters', 'color', 'colorfilters', 'grade']);
  if (filtersRaw && typeof filtersRaw === 'object') {
    row.filters = filtersRaw as ClipColorFilters;
  }

  // Transform
  const transformRaw = get(['transform', 'pip', 'placement']);
  if (transformRaw && typeof transformRaw === 'object') {
    row.transform = transformRaw as ClipTransform;
  }

  // Speed
  const speed = parseNumberCell(get(['speed', 'rate', 'multiplier']));
  if (speed !== undefined && speed > 0) row.speed = speed;

  // Text
  const textRaw = get(['text', 'title', 'caption']);
  if (textRaw && typeof textRaw === 'object') {
    row.text = textRaw as TextContent;
  }

  // Video Fade
  const videoFadeRaw = get(['videofade', 'fade', 'videofades']);
  if (videoFadeRaw && typeof videoFadeRaw === 'object') {
    row.videoFade = videoFadeRaw as ClipVideoFade;
  }

  // Audio Controls
  const gainDb = parseNumberCell(get(['gaindb', 'gain', 'volume', 'level']));
  if (gainDb !== undefined) row.gainDb = gainDb;
  const fadeInFrames = parseNumberCell(get(['fadeinframes', 'fadein']));
  if (fadeInFrames !== undefined) row.fadeInFrames = Math.max(0, Math.round(fadeInFrames));
  const fadeOutFrames = parseNumberCell(get(['fadeoutframes', 'fadeout']));
  if (fadeOutFrames !== undefined) row.fadeOutFrames = Math.max(0, Math.round(fadeOutFrames));
  const audioEnabled = get(['sourceaudioenabled', 'audioenabled', 'audio']);
  if (typeof audioEnabled === 'boolean') row.sourceAudioEnabled = audioEnabled;
  const duckExempt = get(['duckexempt', 'exemptfromduck']);
  if (typeof duckExempt === 'boolean') row.duckExempt = duckExempt;

  // Keyframes
  const keyframesRaw = get(['keyframes', 'curves']);
  if (Array.isArray(keyframesRaw)) row.keyframes = keyframesRaw as ClipKeyframe[];

  return row;
}

/**
 * A JSON `motion`/`transitionParams` object or a CSV `k=v;k=v` cell, one
 * reader. `null` = a stated value this cannot honour (an error was pushed);
 * `undefined` = nothing stated.
 */
function parseTransitionParams(
  raw: unknown,
  label: string,
  errors: string[],
): ClipTransitionParams | null | undefined {
  let source: Record<string, unknown>;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return undefined;
    source = {};
    for (const pair of raw.split(';')) {
      const [key, value] = pair.split('=').map((part) => part.trim());
      if (key) source[key] = value;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    source = raw as Record<string, unknown>;
  } else {
    return undefined;
  }
  const byKey = new Map<string, unknown>();
  for (const [name, value] of Object.entries(source)) byKey.set(foldKey(name), value);

  const params: ClipTransitionParams = {};
  const ratio = parseNumberCell(byKey.get('outinratio') ?? byKey.get('ratio'));
  if (ratio !== undefined) params.outInRatio = Math.min(0.95, Math.max(0.05, ratio));
  const color = byKey.get('colorhex') ?? byKey.get('color') ?? byKey.get('colour');
  if (color !== undefined && asText(color).trim() !== '') {
    const hex = asText(color).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      errors.push(`${label}: “${hex}” is not a #rrggbb colour.`);
      return null;
    }
    params.colorHex = hex;
  }
  const flash = parseNumberCell(byKey.get('flashframes') ?? byKey.get('flash'));
  if (flash !== undefined) {
    params.flashFrames = Math.min(FLASH_FRAMES_MAX, Math.max(1, Math.round(flash)));
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

// The rest of the JSON/CSV shells mirror the S222 importer's shapes exactly.

function jsonRows(
  parsed: unknown,
  errors: string[],
  adjust: Adjustments,
  markers: TimelineSetupMarker[],
): TimelineSetupRow[] {
  const rows: TimelineSetupRow[] = [];

  const pushRecord = (entry: Record<string, unknown>, line: number): void => {
    const byKey = new Map<string, unknown>();
    for (const [name, value] of Object.entries(entry)) byKey.set(foldKey(name), value);
    const get = (keys: string[]): unknown => {
      const found = keys.find((name) => byKey.get(name) !== undefined);
      return found === undefined ? undefined : byKey.get(found);
    };
    const idKey = ID_KEYS.find((name) => typeof byKey.get(name) === 'string');
    const fileKey = FILE_KEYS.find((name) => typeof byKey.get(name) === 'string');
    const headingKey = HEADING_KEYS.find((name) => typeof byKey.get(name) === 'string');
    const key = idKey
      ? String(byKey.get(idKey))
      : fileKey
        ? String(byKey.get(fileKey))
        : headingKey
          ? String(byKey.get(headingKey))
          : '';
    if (!key) {
      errors.push(`Entry ${line} has no id, file or heading.`);
      return;
    }
    const fields = readSetupFields(get, `“${key}”`, errors, adjust);
    if (fields === null) return;
    const orderVal = parseNumberCell(byKey.get('order') ?? byKey.get('ord') ?? byKey.get('index') ?? byKey.get('sortindex'));
    rows.push({
      key,
      file: fileKey ? String(byKey.get(fileKey)) : undefined,
      heading: headingKey ? String(byKey.get(headingKey)) : undefined,
      order: orderVal !== undefined ? orderVal : line,
      line,
      ...fields,
    });
  };

  const container = parsed as Record<string, unknown> | null;
  if (container && !Array.isArray(container) && Array.isArray(container.markers)) {
    (container.markers as unknown[]).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`Marker ${index + 1} is not an object.`);
        return;
      }
      const byKey = new Map<string, unknown>();
      for (const [name, value] of Object.entries(entry as Record<string, unknown>)) {
        byKey.set(foldKey(name), value);
      }
      const frame = parseNumberCell(byKey.get('frame') ?? byKey.get('f'));
      const seconds = parseNumberCell(byKey.get('seconds') ?? byKey.get('t') ?? byKey.get('time'));
      if (frame === undefined && seconds === undefined) {
        errors.push(`Marker ${index + 1} has no frame or time.`);
        return;
      }
      const colorRaw = asText(byKey.get('color'));
      markers.push({
        frame: frame === undefined ? undefined : Math.max(0, Math.round(frame)),
        seconds,
        name: asText(byKey.get('name') ?? byKey.get('label')),
        color: MARKER_COLORS.includes(colorRaw as MarkerColor) ? (colorRaw as MarkerColor) : undefined,
        locked: byKey.get('locked') === true || byKey.get('lock') === true,
        line: index + 1,
      });
    });
  }
  const listKey =
    container && !Array.isArray(container)
      ? ['shots', 'scenes', 'clips'].find((name) => Array.isArray(container[name]))
      : undefined;
  const list = Array.isArray(parsed) ? parsed : listKey ? (container![listKey] as unknown[]) : null;

  if (list) {
    list.forEach((entry, index) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        pushRecord(entry as Record<string, unknown>, index + 1);
      } else {
        errors.push(`Entry ${index + 1} is not an object.`);
      }
    });
    return rows;
  }

  // The S222 plain map: `{ "ep01-s001": 6.44 }` — duration-only, still honoured.
  if (container && typeof container === 'object') {
    let line = 0;
    for (const [key, value] of Object.entries(container)) {
      line += 1;
      const seconds = parseSecondsCell(value);
      if (seconds === undefined) {
        errors.push(`“${key}” has no usable duration.`);
        continue;
      }
      rows.push({ key, seconds, line });
    }
    return rows;
  }

  errors.push('That JSON holds neither a list of clips nor a map of durations.');
  return rows;
}

function csvRows(text: string, errors: string[], adjust: Adjustments): TimelineSetupRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (lines.length === 0) {
    errors.push('That file is empty.');
    return [];
  }

  const delimiter = sniffDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter).map(foldKey);
  const indexOf = (keys: string[]): number => header.findIndex((name: string) => keys.includes(name));
  const idIndex = indexOf(ID_KEYS);
  const fileIndex = indexOf(FILE_KEYS);
  const headingIndex = indexOf(HEADING_KEYS);
  const hasHeader = idIndex !== -1 || fileIndex !== -1 || headingIndex !== -1;

  if (!hasHeader) {
    // Headerless is the S222 two-column shape: key, seconds. Anything more
    // needs names — silent positional setup columns would be a minefield.
    const rows: TimelineSetupRow[] = [];
    lines.forEach((line, index) => {
      const cells = splitCsvLine(line, delimiter);
      const key = cells[0] ?? '';
      if (!key) {
        errors.push(`Row ${index + 1} has no id.`);
        return;
      }
      const seconds = parseSecondsCell(cells[cells.length - 1]);
      if (seconds === undefined) {
        errors.push(`Row ${index + 1} (“${key}”) has no usable duration.`);
        return;
      }
      rows.push({ key, seconds, line: index + 1 });
    });
    return rows;
  }

  const rows: TimelineSetupRow[] = [];
  lines.slice(1).forEach((line, index) => {
    const cells = splitCsvLine(line, delimiter);
    const cell = (at: number): string | undefined => (at === -1 ? undefined : cells[at]);
    const key = cell(idIndex) ?? cell(fileIndex) ?? cell(headingIndex) ?? '';
    const lineNumber = index + 2;
    if (!key) {
      errors.push(`Row ${lineNumber} has no id.`);
      return;
    }
    const get = (keys: string[]): unknown => cell(indexOf(keys));
    const fields = readSetupFields(get, `Row ${lineNumber} (“${key}”)`, errors, adjust);
    if (fields === null) return;
    rows.push({
      key,
      file: cell(fileIndex),
      heading: cell(headingIndex),
      line: lineNumber,
      ...fields,
    });
  });
  return rows;
}

export function parseTimelineSetupFile(text: string, fileName: string): TimelineSetupParse {
  const errors: string[] = [];
  const adjust: Adjustments = { ratesClamped: 0, framesQuantised: 0, offsetsClamped: 0 };
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const claimsJson = /\.json$/i.test(fileName);

  let rows: TimelineSetupRow[];
  const markers: TimelineSetupMarker[] = [];
  let tracks: SequenceTrack[] | undefined;
  let sequence: TimelineSetupParse['sequence'];
  let format: 'json' | 'csv';
  let isFullTimeline = false;
  if (looksJson || (claimsJson && trimmed.length > 0)) {
    format = 'json';
    try {
      const parsedJson = JSON.parse(trimmed);
      rows = jsonRows(parsedJson, errors, adjust, markers);
      if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        if (Array.isArray(parsedJson.tracks)) {
          tracks = parsedJson.tracks as SequenceTrack[];
        }
        if (parsedJson.sequence && typeof parsedJson.sequence === 'object') {
          sequence = parsedJson.sequence as TimelineSetupParse['sequence'];
        }
        if (
          parsedJson.format === 'videostudio-timeline-full-v2' ||
          (Array.isArray(parsedJson.tracks) && parsedJson.tracks.length > 0)
        ) {
          isFullTimeline = true;
        }
      }
    } catch {
      return { rows: [], markers: [], errors: ['That file is not valid JSON.'], notes: [], format, isFullTimeline: false };
    }
  } else {
    format = 'csv';
    rows = csvRows(text, errors, adjust);
  }

  const notes: string[] = [];
  if (adjust.ratesClamped > 0) {
    notes.push(`${adjust.ratesClamped} rate${adjust.ratesClamped === 1 ? '' : 's'} clamped to ${MAX_MOTION_RATE_PCT_PER_SEC} %/s`);
  }
  if (adjust.framesQuantised > 0) {
    notes.push(`${adjust.framesQuantised} transition length${adjust.framesQuantised === 1 ? '' : 's'} quantised`);
  }
  if (adjust.offsetsClamped > 0) {
    notes.push(`${adjust.offsetsClamped} audio offset${adjust.offsetsClamped === 1 ? '' : 's'} clamped`);
  }
  return { rows, markers, tracks, sequence, errors, notes, format, isFullTimeline };
}

/**
 * Convenient alias and wrapper for parsing JSON timeline setup or full timeline JSON.
 */
export function parseTimelineSetupJson(
  text: string,
  _fpsOrFileName?: number | string,
): TimelineSetupParse {
  return parseTimelineSetupFile(text, 'timeline.json');
}

// ---------------------------------------------------------------- matching

/** The clip fields matching needs — narrow so a test needs no full clip. */
export interface MatchableTimelineClip {
  id: string;
  storyShotId: string | null;
  filePath: string | null;
  label: string;
  /** 1-based position on the spine — the ordinal a hand-numbered sheet means. */
  order: number;
  sourceKind: SequenceClip['sourceKind'];
}

export type TimelineSetupMatchKind = 'id' | 'file' | 'heading' | 'ordinal';

export interface TimelineSetupPlan {
  /** The planned change per matched clip, in intent form (frames not yet derived). */
  rowByClipId: Record<string, TimelineSetupRow>;
  matchedBy: Record<string, TimelineSetupMatchKind>;
  unmatchedKeys: string[];
  unmatchedClipIds: string[];
  /** Duration rows that landed on media clips, whose length is a measurement. */
  durationSkippedClipIds: string[];
}

/** A file basename folded for matching: case-insensitive, extension dropped. */
function basenameKey(value: string): string {
  const base = value.replace(/\\/g, '/').split('/').pop() ?? '';
  return base.replace(/\.[^.]+$/, '').toLowerCase();
}

function headingKeyOf(heading: string): string {
  return normalizeHeading(heading).toLowerCase();
}

/**
 * Matches rows onto timeline clips: **shot id → file basename → heading →
 * ordinal** — S222's ladder with the basename rung added, because a pool
 * clip has no `storyShotId` and its file name is the id its author knows.
 * A basename or heading shared by two clips is ambiguous and matches
 * neither (the repeated-slugline rule, restated); first writer wins per
 * clip, so a file listing the same clip twice keeps the earlier row.
 */
export function planTimelineSetup(
  rows: readonly TimelineSetupRow[],
  clips: readonly MatchableTimelineClip[],
): TimelineSetupPlan {
  const byShotId = new Map<string, MatchableTimelineClip>();
  const byFile = new Map<string, MatchableTimelineClip>();
  const ambiguousFiles = new Set<string>();
  const byHeading = new Map<string, MatchableTimelineClip>();
  const ambiguousHeadings = new Set<string>();
  const byOrdinal = new Map<number, MatchableTimelineClip>();

  for (const clip of clips) {
    if (clip.storyShotId) byShotId.set(clip.storyShotId, clip);
    if (clip.filePath) {
      const file = basenameKey(clip.filePath);
      if (byFile.has(file)) ambiguousFiles.add(file);
      else byFile.set(file, clip);
    }
    const heading = headingKeyOf(clip.label ?? '');
    if (heading) {
      if (byHeading.has(heading)) ambiguousHeadings.add(heading);
      else byHeading.set(heading, clip);
    }
    byOrdinal.set(clip.order, clip);
  }
  for (const file of ambiguousFiles) byFile.delete(file);
  for (const heading of ambiguousHeadings) byHeading.delete(heading);

  const rowByClipId: Record<string, TimelineSetupRow> = {};
  const matchedBy: Record<string, TimelineSetupMatchKind> = {};
  const unmatchedKeys: string[] = [];
  const durationSkippedClipIds: string[] = [];

  for (const row of rows) {
    const key = row.key.trim();
    let clip = byShotId.get(key);
    let how: TimelineSetupMatchKind = 'id';

    if (!clip) {
      const file = basenameKey(row.file ?? key);
      const found = file ? byFile.get(file) : undefined;
      if (found) {
        clip = found;
        how = 'file';
      }
    }
    if (!clip) {
      const heading = headingKeyOf(row.heading ?? key);
      const found = heading ? byHeading.get(heading) : undefined;
      if (found) {
        clip = found;
        how = 'heading';
      }
    }
    if (!clip && /^\d+$/.test(key)) {
      clip = byOrdinal.get(Number.parseInt(key, 10));
      how = 'ordinal';
    }

    if (!clip) {
      unmatchedKeys.push(row.key);
      continue;
    }
    if (rowByClipId[clip.id] !== undefined) {
      unmatchedKeys.push(row.key);
      continue;
    }
    let effective = row;
    if (row.seconds !== undefined && clip.sourceKind !== 'still' && clip.sourceKind !== 'text') {
      // A media clip's length is a measurement; the rest of the row still lands.
      durationSkippedClipIds.push(clip.id);
      effective = { ...row, seconds: undefined };
    }
    rowByClipId[clip.id] = effective;
    matchedBy[clip.id] = how;
  }

  return {
    rowByClipId,
    matchedBy,
    unmatchedKeys,
    unmatchedClipIds: clips
      .filter((clip) => rowByClipId[clip.id] === undefined)
      .map((clip) => clip.id),
    durationSkippedClipIds,
  };
}

// ------------------------------------------------------------- application

export interface TimelineSetupClipPatch {
  patch: Partial<SequenceClip>;
  /** Fields to pin against storyboard re-sync — only what the row actually set. */
  overrides: ('durationFrames' | 'motionPreset')[];
}

/**
 * One row as a clip patch — pure, so the apply is testable without a store.
 * Effects merge additively: a row that sets motion leaves the clip's colour
 * grade and text alone, and a row without motion leaves an authored move
 * untouched.
 */
export function materializeTimelineSetupPatch(
  row: TimelineSetupRow,
  clip: Pick<SequenceClip, 'effects'>,
  fps: number,
): TimelineSetupClipPatch {
  const patch: Partial<SequenceClip> = {};
  const overrides: ('durationFrames' | 'motionPreset')[] = [];

  if (row.seconds !== undefined) {
    patch.durationFrames = Math.max(1, secondsToFrames(row.seconds, fps));
    overrides.push('durationFrames');
  }
  if (row.transitionIn !== undefined) {
    patch.transitionIn = row.transitionIn;
    patch.transitionFrames =
      row.transitionIn === 'cut'
        ? 0
        : (row.transitionFrames ?? (row.transitionIn === 'flash_frame' ? 2 : 12));
  }
  if (row.transitionOut !== undefined) {
    patch.transitionOut = row.transitionOut;
    patch.transitionOutFrames = row.transitionOut === 'cut' ? 0 : (row.transitionOutFrames ?? 12);
  }
  if (row.audioOffsetFrames !== undefined) patch.audioOffsetFrames = row.audioOffsetFrames;
  if (row.startFrames !== undefined) {
    patch.startFrames = row.startFrames;
  } else if (row.startSeconds !== undefined) {
    patch.startFrames = Math.max(0, secondsToFrames(row.startSeconds, fps));
  }

  const hasEffects =
    row.motion !== undefined ||
    row.transitionParams !== undefined ||
    row.whiteboard !== undefined ||
    row.filters !== undefined ||
    row.transform !== undefined ||
    row.speed !== undefined ||
    row.text !== undefined ||
    row.videoFade !== undefined;

  if (hasEffects) {
    const effects = { ...clip.effects };
    if (row.motion !== undefined) {
      if (row.motion.preset === 'hold') delete effects.motion;
      else effects.motion = row.motion;
      patch.motionPreset = 'none';
      overrides.push('motionPreset');
    }
    if (row.transitionParams !== undefined) {
      effects.transition = { ...effects.transition, ...row.transitionParams };
    }
    if (row.whiteboard !== undefined) {
      effects.whiteboard = row.whiteboard;
    }
    if (row.filters !== undefined) {
      effects.filters = { ...effects.filters, ...row.filters };
    }
    if (row.transform !== undefined) {
      effects.transform = { ...effects.transform, ...row.transform };
    }
    if (row.speed !== undefined) {
      effects.speed = row.speed;
    }
    if (row.text !== undefined) {
      effects.text = row.text;
    }
    if (row.videoFade !== undefined) {
      effects.videoFade = { ...effects.videoFade, ...row.videoFade };
    }
    patch.effects = effects;
  }

  // Audio Controls
  if (row.gainDb !== undefined) patch.gainDb = row.gainDb;
  if (row.fadeInFrames !== undefined) patch.fadeInFrames = row.fadeInFrames;
  if (row.fadeOutFrames !== undefined) patch.fadeOutFrames = row.fadeOutFrames;
  if (row.sourceAudioEnabled !== undefined) patch.sourceAudioEnabled = row.sourceAudioEnabled;
  if (row.duckExempt !== undefined) patch.duckExempt = row.duckExempt;

  // Keyframes
  if (row.keyframes !== undefined) patch.keyframes = row.keyframes;

  return { patch, overrides };
}

/** "14 of 20 clips matched · 2 by file name · 1 row named nothing here · 1 rate clamped" */
export function describeTimelineSetupPlan(
  plan: TimelineSetupPlan,
  parse: Pick<TimelineSetupParse, 'errors' | 'notes' | 'markers'>,
): string {
  const matched = Object.keys(plan.rowByClipId).length;
  const total = matched + plan.unmatchedClipIds.length;
  const parts = [`${matched} of ${total} clip${total === 1 ? '' : 's'} matched`];
  const byFile = Object.values(plan.matchedBy).filter((how) => how === 'file').length;
  if (byFile > 0) parts.push(`${byFile} by file name`);
  const byOrdinal = Object.values(plan.matchedBy).filter((how) => how === 'ordinal').length;
  if (byOrdinal > 0) parts.push(`${byOrdinal} by position`);
  if (plan.unmatchedKeys.length > 0) {
    parts.push(
      `${plan.unmatchedKeys.length} row${plan.unmatchedKeys.length === 1 ? '' : 's'} named nothing here`,
    );
  }
  if (plan.durationSkippedClipIds.length > 0) {
    parts.push(`${plan.durationSkippedClipIds.length} duration${plan.durationSkippedClipIds.length === 1 ? '' : 's'} skipped on media clips`);
  }
  if (parse.markers.length > 0) {
    parts.push(`${parse.markers.length} marker${parse.markers.length === 1 ? '' : 's'}`);
  }
  if (parse.errors.length > 0) {
    parts.push(`${parse.errors.length} row${parse.errors.length === 1 ? '' : 's'} rejected`);
  }
  parts.push(...parse.notes);
  return parts.join(' · ');
}
