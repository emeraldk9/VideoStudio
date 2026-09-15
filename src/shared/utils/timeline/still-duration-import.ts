import { normalizeHeading } from './scene-breakdown';

/**
 * Beta S222 — reading exact still durations out of a JSON or CSV file.
 *
 * Pure: text in, rows out, then rows plus a shot list in, a shot-id-keyed map
 * out. No IPC and no `fs` — the main process opens the dialog and hands back
 * the text, and the *matching* happens in front of the user so an unmatched
 * row is reported rather than silently dropped.
 *
 * **The file this is designed to accept first is the episode JSON the project
 * already imports.** A user who wrote `"durationSeconds": 6.44` into
 * `Journey 01.episode.json` should be able to point at that same file and have
 * the timeline honour those numbers, without a second export step and without
 * re-importing the episode (which would rewrite prompts and takes). Every
 * other accepted shape exists because a spreadsheet is the other way people
 * hold a list of shot lengths.
 *
 * Accepted JSON:
 *
 * ```jsonc
 * { "shots": [{ "id": "ep01-s001", "durationSeconds": 6.44 }] }  // an episode file
 * [{ "id": "ep01-s001", "seconds": 6.44 }]                       // a bare list
 * { "ep01-s001": 6.44 }                                          // a plain map
 * ```
 *
 * Accepted CSV (also TSV and semicolon-delimited — the delimiter is sniffed):
 * a header row naming an id-ish column and a seconds-ish column in any order,
 * or a headerless two-column `id,seconds`. `heading` is read when present, so
 * a sheet keyed by slugline still matches.
 *
 * What it will not do: invent a shot, reorder anything, or accept a
 * non-positive number. A `0`, a `-1` or an `"n/a"` is a *stated* row that
 * cannot be honoured, so it is returned as an error rather than rounded up to
 * something plausible.
 */

/** One row as the file stated it, before it is matched to anything. */
export interface StillDurationRow {
  /** Whatever the file offered as the key — a shot id, a heading, or an ordinal. */
  key: string;
  seconds: number;
  /** A separate heading column, when the sheet had one alongside an id. */
  heading?: string;
  /** 1-based position in the file, for the "row 12" in an error. */
  line: number;
}

export interface StillDurationParse {
  rows: StillDurationRow[];
  /** Rows the file stated and this could not use, each already phrased for display. */
  errors: string[];
  format: 'json' | 'csv';
}

/** The largest still this will accept from a file. Past it, a stray millisecond column is the likelier reading. */
export const MAX_IMPORTED_STILL_SECONDS = 600;

const ID_KEYS = ['id', 'shotid', 'shot', 'shot_id', 'key'];
const SECONDS_KEYS = [
  'seconds',
  'duration',
  'durationseconds',
  'duration_seconds',
  'durationsec',
  'secs',
  'length',
];
const HEADING_KEYS = ['heading', 'slugline', 'scene', 'title'];

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '');
}

/**
 * A number from anything a sheet might hold: `6.44`, `"6.44"`, `"6.44s"`,
 * `"6,44"` (the decimal comma a European export writes).
 *
 * Returns `undefined` rather than `NaN` so every caller has to decide what an
 * unreadable cell means, instead of propagating a `NaN` into a frame count.
 */
export function parseSecondsCell(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 && raw <= MAX_IMPORTED_STILL_SECONDS ? raw : undefined;
  }
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().replace(/\s*(?:s|secs?|seconds?)$/i, '');
  if (!text) return undefined;
  // A comma is a decimal separator only when it is the *only* one and no dot
  // is present; `1,234.5` stays a thousands separator.
  const normalized = text.includes('.') ? text.replace(/,/g, '') : text.replace(',', '.');
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value <= MAX_IMPORTED_STILL_SECONDS ? value : undefined;
}

// ------------------------------------------------------------------- JSON

function jsonRows(parsed: unknown, errors: string[]): StillDurationRow[] {
  const rows: StillDurationRow[] = [];

  const pushRecord = (entry: Record<string, unknown>, line: number): void => {
    const byKey = new Map<string, unknown>();
    for (const [name, value] of Object.entries(entry)) byKey.set(normalizeKey(name), value);
    const idKey = ID_KEYS.find((name) => typeof byKey.get(name) === 'string');
    const headingKey = HEADING_KEYS.find((name) => typeof byKey.get(name) === 'string');
    const secondsKey = SECONDS_KEYS.find((name) => byKey.get(name) !== undefined);
    const key = idKey ? String(byKey.get(idKey)) : headingKey ? String(byKey.get(headingKey)) : '';
    if (!key) {
      errors.push(`Entry ${line} has no id or heading.`);
      return;
    }
    const seconds = secondsKey === undefined ? undefined : parseSecondsCell(byKey.get(secondsKey));
    if (seconds === undefined) {
      errors.push(`“${key}” has no usable duration.`);
      return;
    }
    rows.push({
      key,
      seconds,
      heading: headingKey ? String(byKey.get(headingKey)) : undefined,
      line,
    });
  };

  // An episode file: `{ shots: [...] }`. `scenes`/`clips` are the two other
  // names the same list has travelled under in this project's docs.
  const container = parsed as Record<string, unknown> | null;
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

  // A plain map: `{ "ep01-s001": 6.44 }`.
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

  errors.push('That JSON holds neither a list of shots nor a map of durations.');
  return rows;
}

// -------------------------------------------------------------------- CSV

/** Splits one CSV line, honouring `"quoted, fields"` and `""` escapes. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** Comma, tab or semicolon — whichever the header row holds most of. */
export function sniffDelimiter(header: string): string {
  const counts = [',', '\t', ';'].map((delimiter) => ({
    delimiter,
    count: header.split(delimiter).length,
  }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

function csvRows(text: string, errors: string[]): StillDurationRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (lines.length === 0) {
    errors.push('That file is empty.');
    return [];
  }

  const delimiter = sniffDelimiter(lines[0]);
  const first = splitCsvLine(lines[0], delimiter).map(normalizeKey);
  const idIndex = first.findIndex((name) => ID_KEYS.includes(name));
  const secondsIndex = first.findIndex((name) => SECONDS_KEYS.includes(name));
  const headingIndex = first.findIndex((name) => HEADING_KEYS.includes(name));
  const hasHeader = secondsIndex !== -1 && (idIndex !== -1 || headingIndex !== -1);

  // Headerless: the first column is the key and the *last* is the duration,
  // which is where a two- or three-column sheet puts it either way.
  const body = hasHeader ? lines.slice(1) : lines;
  const rows: StillDurationRow[] = [];

  body.forEach((line, index) => {
    const cells = splitCsvLine(line, delimiter);
    const key = (hasHeader ? cells[idIndex === -1 ? headingIndex : idIndex] : cells[0]) ?? '';
    const rawSeconds = hasHeader ? cells[secondsIndex] : cells[cells.length - 1];
    const lineNumber = index + (hasHeader ? 2 : 1);
    if (!key) {
      errors.push(`Row ${lineNumber} has no id.`);
      return;
    }
    const seconds = parseSecondsCell(rawSeconds);
    if (seconds === undefined) {
      errors.push(`Row ${lineNumber} (“${key}”) has no usable duration.`);
      return;
    }
    rows.push({
      key,
      seconds,
      heading: hasHeader && headingIndex !== -1 ? cells[headingIndex] : undefined,
      line: lineNumber,
    });
  });

  return rows;
}

/**
 * Reads a picked file's text.
 *
 * `fileName` decides the format only when the text is ambiguous — a `.txt`
 * holding JSON is still JSON, because what the bytes are beats what the
 * extension claims.
 */
export function parseStillDurationFile(text: string, fileName: string): StillDurationParse {
  const errors: string[] = [];
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const claimsJson = /\.json$/i.test(fileName);

  if (looksJson || (claimsJson && trimmed.length > 0)) {
    try {
      return { rows: jsonRows(JSON.parse(trimmed), errors), errors, format: 'json' };
    } catch {
      return { rows: [], errors: ['That file is not valid JSON.'], format: 'json' };
    }
  }
  return { rows: csvRows(text, errors), errors, format: 'csv' };
}

// ---------------------------------------------------------------- matching

/** The shot fields matching needs. Narrow so a test needs no full `StoryShot`. */
export interface MatchableShot {
  id: string;
  order: number;
  heading: string;
}

export interface StillDurationMatch {
  /** What a `'file'`-source layout reads. Only shots this actually matched. */
  secondsByShotId: Record<string, number>;
  /** How each match was made, for the summary line. */
  matchedBy: Record<string, 'id' | 'heading' | 'ordinal'>;
  /** File rows that named nothing in this episode. */
  unmatchedKeys: string[];
  /** Shots the file said nothing about — they keep their stated length. */
  unmatchedShotIds: string[];
}

/**
 * Matches rows onto shots: **shot id, then heading, then ordinal.**
 *
 * Id first because it is the only key that survives a rewrite — a heading is
 * edited constantly and an ordinal shifts the moment a shot is inserted, which
 * is Beta S43's lesson restated for a different file. Ordinal is last and
 * still offered, because a spreadsheet someone typed by hand is numbered
 * 1..N and refusing it would send them to look up 60 uuids.
 *
 * First writer wins per shot, so a file listing the same shot twice keeps the
 * earlier row and reports the later one — the opposite (last wins) would make
 * the outcome depend on a file order nobody looks at.
 */
function headingKeyOf(heading: string): string {
  // `normalizeHeading` strips the decoration and the `- (8 seconds)` tail but
  // preserves case; a sheet typed in Title Case must still match a slugline
  // stored in caps, so the fold happens here rather than in the shared helper.
  return normalizeHeading(heading).toLowerCase();
}

export function matchStillDurations(
  rows: readonly StillDurationRow[],
  shots: readonly MatchableShot[],
): StillDurationMatch {
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  const byHeading = new Map<string, MatchableShot>();
  const ambiguousHeadings = new Set<string>();
  const byOrdinal = new Map<number, MatchableShot>();
  for (const shot of shots) {
    const heading = headingKeyOf(shot.heading ?? '');
    // Only unique headings are matchable — two shots on the same slugline
    // would otherwise resolve by file order, which is a coin flip. A repeated
    // slugline is extremely common (three shots on BELLWEATHER ROAD - DAY),
    // so this is the normal case, not an edge one.
    if (heading) {
      if (byHeading.has(heading)) ambiguousHeadings.add(heading);
      else byHeading.set(heading, shot);
    }
    byOrdinal.set(shot.order, shot);
  }
  for (const heading of ambiguousHeadings) byHeading.delete(heading);

  const secondsByShotId: Record<string, number> = {};
  const matchedBy: Record<string, 'id' | 'heading' | 'ordinal'> = {};
  const unmatchedKeys: string[] = [];

  for (const row of rows) {
    const key = row.key.trim();
    let shot = byId.get(key);
    let how: 'id' | 'heading' | 'ordinal' = 'id';

    if (!shot) {
      const heading = headingKeyOf(row.heading ?? key);
      const found = heading ? byHeading.get(heading) : undefined;
      if (found) {
        shot = found;
        how = 'heading';
      }
    }
    if (!shot && /^\d+$/.test(key)) {
      shot = byOrdinal.get(Number.parseInt(key, 10));
      how = 'ordinal';
    }

    if (!shot) {
      unmatchedKeys.push(row.key);
      continue;
    }
    if (secondsByShotId[shot.id] !== undefined) {
      unmatchedKeys.push(row.key);
      continue;
    }
    secondsByShotId[shot.id] = row.seconds;
    matchedBy[shot.id] = how;
  }

  return {
    secondsByShotId,
    matchedBy,
    unmatchedKeys,
    unmatchedShotIds: shots.filter((shot) => secondsByShotId[shot.id] === undefined).map((shot) => shot.id),
  };
}

/** "14 of 14 shots matched · 2 rows named nothing here" — one line for the panel. */
export function describeStillDurationMatch(match: StillDurationMatch): string {
  const matched = Object.keys(match.secondsByShotId).length;
  const total = matched + match.unmatchedShotIds.length;
  const parts = [`${matched} of ${total} shot${total === 1 ? '' : 's'} matched`];
  if (match.unmatchedKeys.length > 0) {
    parts.push(
      `${match.unmatchedKeys.length} row${match.unmatchedKeys.length === 1 ? '' : 's'} named nothing here`,
    );
  }
  const byOrdinal = Object.values(match.matchedBy).filter((how) => how === 'ordinal').length;
  if (byOrdinal > 0) parts.push(`${byOrdinal} matched by position`);
  return parts.join(' · ');
}
