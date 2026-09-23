import { z } from 'zod';

import {
  CLIP_COLOR_LABELS,
  CLIP_OVERRIDABLE_FIELDS,
  CLIP_TRANSITIONS,
  MARKER_COLORS,
  RENDER_ACCELERATIONS,
  RENDER_AUDIO_BITRATES,
  RENDER_DELIVERY_FORMATS,
  RENDER_QUALITIES,
  SEQUENCE_SOURCE_KINDS,
  STILL_DURATION_SOURCES,
  STILL_FRAME_SOURCES,
  STILL_MOTION_PRESETS,
  TRACK_KINDS,
  TRACK_ROLES,
} from '../types/sequence';
import {
  WATERMARK_ENGINES,
  WATERMARK_OUTPUT_MODES,
  WATERMARK_SOURCE_KINDS,
} from '../types/watermark';
import { clipEffectsSchema } from '../utils/timeline/effects';
import { KEYFRAME_INTERPOLATIONS, KEYFRAME_PROPERTIES } from '../utils/timeline/keyframes';

import { IPC_CHANNELS } from './ipc-channels';

export const MAX_SEQUENCE_NAME_LENGTH = 120;
export const MAX_SEQUENCE_CLIPS = 1000;
export const MAX_SEQUENCE_TRACKS = 64;
export const MAX_IMPORTED_STILL_SECONDS = 3600;

export const frameCountSchema = z.number().int().min(0).max(86400 * 120);

export const sequenceTrackSchema = z.object({
  id: z.string().min(1),
  sequenceId: z.string().min(1),
  kind: z.enum(TRACK_KINDS),
  name: z.string().min(1).max(MAX_SEQUENCE_NAME_LENGTH),
  orderIndex: z.number().int().min(0).max(MAX_SEQUENCE_TRACKS),
  muted: z.boolean(),
  locked: z.boolean(),
  magnetic: z.boolean().default(false),
  volume: z.number().min(0).max(2),
  solo: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  heightPx: z.number().int().min(24).max(400),
  role: z.enum(TRACK_ROLES).nullable(),
});

export const sequenceClipSchema = z.object({
  id: z.string().min(1),
  sequenceId: z.string().min(1),
  trackId: z.string().min(1),
  orderIndex: z.number().int().min(0).max(MAX_SEQUENCE_CLIPS),
  sourceKind: z.enum(SEQUENCE_SOURCE_KINDS),
  outputId: z.string().min(1).nullable().optional(),
  storyShotId: z.string().min(1).nullable().optional(),
  sourceTakeId: z.string().min(1).nullable().optional(),
  filePath: z.string().min(1).nullable(),
  startFrames: frameCountSchema.nullable().optional(),
  durationFrames: frameCountSchema,
  sourceInFrames: frameCountSchema.nullable().optional(),
  sourceOutFrames: frameCountSchema.nullable().optional(),
  transitionIn: z.enum(CLIP_TRANSITIONS),
  transitionFrames: frameCountSchema,
  transitionOut: z.enum(CLIP_TRANSITIONS).optional(),
  transitionOutFrames: frameCountSchema.optional(),
  audioOffsetFrames: z.number().int().min(-48).max(48).optional(),
  motionPreset: z.enum(STILL_MOTION_PRESETS),
  gainDb: z.number().min(-40).max(40),
  fadeInFrames: frameCountSchema,
  fadeOutFrames: frameCountSchema,
  sourceAudioEnabled: z.boolean().optional(),
  duckExempt: z.boolean().optional(),
  label: z.string().max(500),
  overrides: z.array(z.enum(CLIP_OVERRIDABLE_FIELDS)),
  colorLabel: z.enum(CLIP_COLOR_LABELS).optional(),
  linkedClipId: z.string().min(1).nullable().optional(),
  syncOffsetFrames: z.number().int().optional(),
  effects: clipEffectsSchema.optional(),
  keyframes: z
    .array(
      z
        .object({
          property: z.enum(KEYFRAME_PROPERTIES),
          frame: frameCountSchema,
          value: z.number().finite(),
          interpolation: z.enum(KEYFRAME_INTERPOLATIONS),
          handleIn: z
            .object({
              frameOffset: z.number().finite(),
              valueOffset: z.number().finite(),
            })
            .optional(),
          handleOut: z
            .object({
              frameOffset: z.number().finite(),
              valueOffset: z.number().finite(),
            })
            .optional(),
        })
        .strict(),
    )
    .max(200)
    .optional(),
});

export const IPC_SCHEMAS = {
  // Sequence
  [IPC_CHANNELS.SEQUENCE_LIST]: z.object({ projectId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_GET]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_CREATE]: z.object({
    projectId: z.string().min(1),
    storyEpisodeId: z.string().min(1).nullable().optional(),
    storyProjectRoot: z.string().min(1).max(4096).nullable().optional(),
    name: z.string().min(1).max(MAX_SEQUENCE_NAME_LENGTH),
    fps: z.number().int().min(1).max(120).optional(),
    width: z.number().int().min(16).max(7680).optional(),
    height: z.number().int().min(16).max(4320).optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_RENAME]: z.object({
    sequenceId: z.string().min(1),
    name: z.string().min(1).max(MAX_SEQUENCE_NAME_LENGTH),
  }),
  [IPC_CHANNELS.SEQUENCE_DELETE]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_UPDATE_SETTINGS]: z.object({
    sequenceId: z.string().min(1),
    fps: z.number().int().min(1).max(120).optional(),
    width: z.number().int().min(16).max(7680).optional(),
    height: z.number().int().min(16).max(4320).optional(),
    storyEpisodeId: z.string().min(1).nullable().optional(),
    storyProjectRoot: z.string().min(1).max(4096).nullable().optional(),
    spineTrackId: z.string().min(1).nullable().optional(),
    stillDurationSource: z.enum(STILL_DURATION_SOURCES).optional(),
    stillFrameSource: z.enum(STILL_FRAME_SOURCES).optional(),
    stillDurations: z
      .object({
        fileName: z.string().max(260),
        importedAt: z.string().max(64),
        secondsByShotId: z.record(
          z.string().min(1).max(128),
          z.number().positive().max(MAX_IMPORTED_STILL_SECONDS),
        ),
      })
      .nullable()
      .optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_REPLACE_CLIPS]: z.object({
    sequenceId: z.string().min(1),
    clips: z.array(sequenceClipSchema).max(MAX_SEQUENCE_CLIPS),
  }),
  [IPC_CHANNELS.SEQUENCE_REPLACE_DOCUMENT]: z.object({
    sequenceId: z.string().min(1),
    tracks: z.array(sequenceTrackSchema).max(MAX_SEQUENCE_TRACKS),
    clips: z.array(sequenceClipSchema).max(MAX_SEQUENCE_CLIPS),
    spineTrackId: z.string().min(1).nullable(),
  }),
  [IPC_CHANNELS.SEQUENCE_LIST_MARKERS]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_ADD_MARKER]: z.object({
    sequenceId: z.string().min(1),
    frame: frameCountSchema,
    name: z.string().max(MAX_SEQUENCE_NAME_LENGTH).optional(),
    notes: z.string().max(10000).optional(),
    color: z.enum(MARKER_COLORS).optional(),
    locked: z.boolean().optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_UPDATE_MARKER]: z.object({
    sequenceId: z.string().min(1),
    markerId: z.string().min(1),
    frame: frameCountSchema.optional(),
    name: z.string().max(MAX_SEQUENCE_NAME_LENGTH).optional(),
    notes: z.string().max(10000).optional(),
    color: z.enum(MARKER_COLORS).optional(),
    locked: z.boolean().optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_DELETE_MARKER]: z.object({
    sequenceId: z.string().min(1),
    markerId: z.string().min(1),
  }),
  [IPC_CHANNELS.SEQUENCE_PROBE_SOURCES]: z.object({
    paths: z.array(z.string().min(1)).max(MAX_SEQUENCE_CLIPS),
  }),
  [IPC_CHANNELS.SEQUENCE_GET_PEAKS]: z.object({ sourcePath: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_TRACE_WHITEBOARD]: z.object({
    filePath: z.string().min(1),
    trace: z
      .object({
        detail: z.enum(['low', 'medium', 'high']),
        order: z.enum(['reading', 'nearest']),
        strokeFraction: z.number().min(0.1).max(0.95).optional(),
      })
      .strict(),
    frameWidth: z.number().int().min(16).max(7680),
    frameHeight: z.number().int().min(16).max(7680),
  }),
  [IPC_CHANNELS.SEQUENCE_GET_FILMSTRIP]: z.object({ sourcePath: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_GET_ENCODER]: z.void(),
  [IPC_CHANNELS.SEQUENCE_RENDER]: z.object({
    sequenceId: z.string().min(1),
    outputPath: z.string().min(1),
    draft: z.boolean().optional(),
    duckMusicUnderNarration: z.boolean().optional(),
    outputHeight: z.number().int().min(240).max(4320).optional(),
    quality: z.enum(RENDER_QUALITIES).optional(),
    audioBitrateKbps: z
      .number()
      .int()
      .refine((value): value is (typeof RENDER_AUDIO_BITRATES)[number] =>
        (RENDER_AUDIO_BITRATES as readonly number[]).includes(value),
      )
      .optional(),
    audioOnly: z.boolean().optional(),
    acceleration: z.enum(RENDER_ACCELERATIONS).optional(),
    format: z.enum(RENDER_DELIVERY_FORMATS).optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_CANCEL_RENDER]: z.void(),
  [IPC_CHANNELS.SEQUENCE_ACTIVE_RENDER]: z.void(),
  [IPC_CHANNELS.SEQUENCE_CHOOSE_EXPORT_PATH]: z.object({
    suggestedName: z.string().min(1).max(MAX_SEQUENCE_NAME_LENGTH),
    format: z.enum(['mp4', 'm4a', 'gif', 'webm', 'apng', 'png']).optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_EXPORT_OTIO]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_EXPORT_TIMELINE_SETUP]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_IMPORT_TIMELINE_SETUP]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_EXPORT_FULL_JSON]: z.object({ sequenceId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_IMPORT_FULL_JSON]: z.object({
    sequenceId: z.string().min(1),
    mode: z.enum(['patch', 'reconstruct']).optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_PICK_STILL_DURATIONS]: z.object({}),
  [IPC_CHANNELS.SEQUENCE_PICK_MEDIA]: z.object({
    kind: z.enum(['still', 'video', 'audio']),
    projectId: z.string().min(1),
  }),
  [IPC_CHANNELS.SEQUENCE_LIST_MEDIA]: z.object({ projectId: z.string().min(1) }),
  [IPC_CHANNELS.SEQUENCE_IMPORT_DROPPED_MEDIA]: z.object({
    projectId: z.string().min(1),
    paths: z.array(z.string().min(1)).min(1).max(MAX_SEQUENCE_CLIPS),
  }),
  [IPC_CHANNELS.SEQUENCE_REMOVE_MEDIA]: z.object({
    projectId: z.string().min(1),
    paths: z.array(z.string().min(1)).min(1).max(MAX_SEQUENCE_CLIPS),
    deleteClips: z.boolean().optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_ADD_TRACK]: z.object({
    sequenceId: z.string().min(1),
    kind: z.enum(TRACK_KINDS),
    name: z.string().min(1).max(MAX_SEQUENCE_NAME_LENGTH),
    role: z.enum(TRACK_ROLES).nullable().optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_UPDATE_TRACK]: z.object({
    sequenceId: z.string().min(1),
    trackId: z.string().min(1),
    name: z.string().min(1).max(MAX_SEQUENCE_NAME_LENGTH).optional(),
    muted: z.boolean().optional(),
    locked: z.boolean().optional(),
    volume: z.number().min(0).max(2).optional(),
    solo: z.boolean().optional(),
    videoEnabled: z.boolean().optional(),
    heightPx: z.number().int().min(24).max(400).optional(),
    role: z.enum(TRACK_ROLES).nullable().optional(),
  }),
  [IPC_CHANNELS.SEQUENCE_DELETE_TRACK]: z.object({
    sequenceId: z.string().min(1),
    trackId: z.string().min(1),
  }),
  [IPC_CHANNELS.SEQUENCE_REORDER_TRACKS]: z.object({
    sequenceId: z.string().min(1),
    kind: z.enum(TRACK_KINDS),
    orderedIds: z.array(z.string().min(1)).min(1).max(MAX_SEQUENCE_TRACKS),
  }),
  [IPC_CHANNELS.SEQUENCE_CAPTURE_FRAME]: z.object({
    sourcePath: z.string().min(1),
    atSeconds: z.number().min(0),
    sequenceId: z.string().optional(),
  }),

  // Projects
  [IPC_CHANNELS.PROJECT_LIST]: z.void(),
  [IPC_CHANNELS.PROJECT_GET]: z.object({ projectId: z.string().min(1) }),
  [IPC_CHANNELS.PROJECT_CREATE]: z.object({
    name: z.string().min(1).max(100),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '21:9']).optional(),
    fps: z.number().int().min(1).max(120).optional(),
  }),
  [IPC_CHANNELS.PROJECT_RENAME]: z.object({
    projectId: z.string().min(1),
    name: z.string().min(1).max(100),
  }),
  [IPC_CHANNELS.PROJECT_DELETE]: z.object({ projectId: z.string().min(1) }),
  [IPC_CHANNELS.PROJECT_UPDATE_SETTINGS]: z.object({
    projectId: z.string().min(1),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '21:9']).optional(),
    fps: z.number().int().min(1).max(120).optional(),
  }),

  // Veo3Flow
  [IPC_CHANNELS.VEO3FLOW_OPEN_FOLDER]: z.void(),
  [IPC_CHANNELS.VEO3FLOW_PARSE_FOLDER]: z.object({ folderPath: z.string().min(1) }),
  [IPC_CHANNELS.VEO3FLOW_INGEST_TO_PROJECT]: z.object({
    folderPath: z.string().min(1),
    projectId: z.string().min(1),
  }),
  [IPC_CHANNELS.VEO3FLOW_WATCH_FOLDER]: z.object({ folderPath: z.string().min(1) }),
  [IPC_CHANNELS.VEO3FLOW_UNWATCH_FOLDER]: z.void(),

  // Watermark
  [IPC_CHANNELS.WATERMARK_START_BATCH]: z.object({
    sources: z
      .array(
        z.object({
          kind: z.enum(WATERMARK_SOURCE_KINDS),
          sourceId: z.string().min(1),
          sourcePath: z.string().optional(),
        }),
      )
      .min(1)
      .max(200)
      .optional(),
    items: z
      .array(
        z.object({
          sourceKind: z.enum(WATERMARK_SOURCE_KINDS),
          sourceId: z.string().min(1),
          sourcePath: z.string().min(1),
        }),
      )
      .min(1)
      .max(200)
      .optional(),
    region: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('preset'), presetId: z.string().min(1) }),
        z.object({
          kind: z.literal('manual'),
          rect: z.object({
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
          }),
        }),
      ])
      .optional(),
    outputMode: z.enum(WATERMARK_OUTPUT_MODES),
    engineOverride: z.enum(WATERMARK_ENGINES).optional(),
    exportDirToken: z.string().optional(),
    lossless: z.boolean().optional(),
    perItemBudgetMs: z.number().optional(),
  }),
  [IPC_CHANNELS.WATERMARK_CANCEL_BATCH]: z.void(),
  [IPC_CHANNELS.WATERMARK_CHECK_CAPABILITIES]: z.void(),
  [IPC_CHANNELS.WATERMARK_LIST_PRESETS]: z.void(),
  [IPC_CHANNELS.WATERMARK_FRAME]: z.object({
    source: z.object({
      kind: z.enum(WATERMARK_SOURCE_KINDS),
      sourceId: z.string().min(1),
    }),
    atSeconds: z.number().min(0).optional(),
  }),
  [IPC_CHANNELS.WATERMARK_PREVIEW]: z.object({
    source: z.object({
      kind: z.enum(WATERMARK_SOURCE_KINDS),
      sourceId: z.string().min(1),
    }),
    region: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('preset'), presetId: z.string().min(1) }),
      z.object({
        kind: z.literal('manual'),
        rect: z.object({
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
        }),
      }),
    ]),
    atSeconds: z.number().min(0).optional(),
  }),
  [IPC_CHANNELS.WATERMARK_GET_BATCH]: z.object({ batchId: z.string().min(1) }),
  [IPC_CHANNELS.WATERMARK_INPAINT_STATUS]: z.void(),
  [IPC_CHANNELS.WATERMARK_DOWNLOAD_MODEL]: z.void(),
  [IPC_CHANNELS.WATERMARK_REMOVE_MODEL]: z.void(),
  [IPC_CHANNELS.WATERMARK_CANCEL_MODEL_DOWNLOAD]: z.void(),
  [IPC_CHANNELS.WATERMARK_PICK_EXTERNAL_FILES]: z.void(),
  [IPC_CHANNELS.WATERMARK_PICK_EXPORT_DIR]: z.void(),
  [IPC_CHANNELS.WATERMARK_CLEAN_STATUS]: z.object({
    refs: z.array(
      z.object({
        kind: z.string().min(1),
        sourceId: z.string().min(1),
      }),
    ),
  }),

  // Dialogs & Files
  [IPC_CHANNELS.DIALOG_OPEN_FILE]: z.object({
    title: z.string().optional(),
    filters: z
      .array(z.object({ name: z.string(), extensions: z.array(z.string()) }))
      .optional(),
    properties: z.array(z.string()).optional(),
  }),
  [IPC_CHANNELS.DIALOG_SAVE_FILE]: z.object({
    title: z.string().optional(),
    defaultPath: z.string().optional(),
    filters: z
      .array(z.object({ name: z.string(), extensions: z.array(z.string()) }))
      .optional(),
  }),
  [IPC_CHANNELS.FILES_SHOW_IN_FOLDER]: z.object({ path: z.string().min(1) }),
  [IPC_CHANNELS.APP_GET_VERSION]: z.void(),
};
