import type { IpcMainInvokeEvent } from 'electron';

import type { z } from 'zod';

import { IPC_SCHEMAS } from '@shared';

import { Logger } from '../logging/logger';

const logger = Logger.createChildLogger('ipc-validation');

/**
 * S298 — which channel does a schema belong to? Owner-reported: a storm of
 * schema rejections (a stale dev main process refusing every `replaceClips`
 * from a hot-reloaded renderer) left **zero** trace in the NDJSON logs — the
 * throw reached the renderer's toasts and nothing else, so the ground-truth
 * log said the app was healthy while the user watched a wall of errors.
 * `withValidation` only ever receives the schema, so the channel is recovered
 * by identity from the registry it came from (lazy, built once).
 */
let schemaChannels: Map<unknown, string> | null = null;
function channelOf(schema: unknown): string {
  schemaChannels ??= new Map(
    Object.entries(IPC_SCHEMAS).map(([channel, entry]) => [entry, channel]),
  );
  return schemaChannels.get(schema) ?? 'unknown-channel';
}

export type ValidatedIpcHandler<T> = (event: IpcMainInvokeEvent, payload: T) => unknown;

/**
 * Wraps an IPC handler so the payload is validated against `schema` before
 * the handler runs. Renderer-supplied data is never trusted directly
 * (CLAUDE.md architecture rule) — every `ipcMain.handle` registration must
 * go through this wrapper with the channel's schema from `IPC_SCHEMAS`.
 *
 * Matches `ipcMain.handle`'s `(event, ...args) => unknown` shape exactly,
 * so it can be passed straight to `ipcMain.handle(channel, withValidation(...))`.
 */
export function withValidation<T>(schema: z.ZodType<T>, handler: ValidatedIpcHandler<T>) {
  return (event: IpcMainInvokeEvent, payload: unknown): unknown => {
    const result = schema.safeParse(payload);
    if (!result.success) {
      const issues = formatIssues(result.error);
      // S298 — rejected payloads land in the NDJSON log, not only in the
      // renderer's toast: the log is the ground truth, and a validation storm
      // (e.g. a renderer running newer code than this process) must be
      // visible there.
      logger.warn('IPC payload rejected', { channel: channelOf(schema), issues });
      throw new Error(`Invalid IPC payload: ${issues}`);
    }
    return handler(event, result.data);
  };
}

/**
 * Renders a validation failure as readable text rather than `ZodError.message`,
 * which is a pretty-printed JSON dump of the whole issue array.
 *
 * That dump reaches users. Beta S224, owner-reported: a Storyboard render of a
 * 116-shot episode hit a schema cap and the toast read
 * `Invalid IPC payload: [ { "origin": "array", "code": "too_big", "maximum":
 * 100, "inclusive": true, "path": [ "items" ], "message": "Invalid input" } ]`
 * — every word of which is about zod, and none about what to do. A schema that
 * bothers to carry a human message (the batch cap now does) deserves to have
 * it read, and `path: message` says more about a malformed payload than the
 * JSON did.
 *
 * At most three issues, so one bad field cannot produce a toast the size of
 * the screen; the count of the rest is stated rather than dropped silently.
 */
function formatIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const remaining = error.issues.length - issues.length;
  return remaining > 0 ? `${issues.join('; ')} (+${remaining} more)` : issues.join('; ');
}
