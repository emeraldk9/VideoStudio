import { contextBridge, ipcRenderer, webUtils } from 'electron';

import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type AspectRatioOption,
  type ImportedMediaFile,
  type ProjectRecord,
  type RemoveImportedMediaResult,
  type RenderEncoderInfo,
  type Sequence,
  type SequenceDocument,
  type SequenceMarker,
  type SequenceRenderProgress,
  type SequenceRenderResult,
  type Veo3FlowProjectData,
  type WatermarkInpaintStatus,
  type WhiteboardTraceMapPayload,
} from '@shared';

function subscribe<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  webUtils: {
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },
  sequence: {
    list: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_LIST, { projectId }) as Promise<Sequence[]>,
    get: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_GET, { sequenceId }) as Promise<SequenceDocument | null>,
    create: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_CREATE, request) as Promise<SequenceDocument>,
    rename: (request: { sequenceId: string; name: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_RENAME, request) as Promise<Sequence | null>,
    delete: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_DELETE, { sequenceId }) as Promise<void>,
    updateSettings: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_UPDATE_SETTINGS, request) as Promise<SequenceDocument | null>,
    replaceClips: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_REPLACE_CLIPS, request) as Promise<SequenceDocument | null>,
    replaceDocument: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_REPLACE_DOCUMENT, request) as Promise<SequenceDocument | null>,
    listMarkers: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_LIST_MARKERS, { sequenceId }) as Promise<SequenceMarker[]>,
    addMarker: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_ADD_MARKER, request) as Promise<SequenceMarker[]>,
    updateMarker: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_UPDATE_MARKER, request) as Promise<SequenceMarker[]>,
    deleteMarker: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_DELETE_MARKER, request) as Promise<SequenceMarker[]>,
    probeSources: (paths: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_PROBE_SOURCES, { paths }) as Promise<any>,
    getPeaks: (sourcePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_GET_PEAKS, { sourcePath }) as Promise<number[] | null>,
    traceWhiteboard: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_TRACE_WHITEBOARD, request) as Promise<WhiteboardTraceMapPayload>,
    getFilmstrip: (sourcePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_GET_FILMSTRIP, { sourcePath }) as Promise<any>,
    captureFrame: (request: { sourcePath: string; atSeconds: number; sequenceId?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_CAPTURE_FRAME, request) as Promise<{ imagePath: string; url: string } | null>,
    getEncoder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_GET_ENCODER) as Promise<RenderEncoderInfo>,
    render: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_RENDER, request) as Promise<SequenceRenderResult>,
    cancelRender: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_CANCEL_RENDER) as Promise<void>,
    activeRender: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_ACTIVE_RENDER) as Promise<boolean>,
    chooseExportPath: (suggestedName: string, format?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_CHOOSE_EXPORT_PATH, { suggestedName, format }) as Promise<string | null>,
    exportOtio: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_EXPORT_OTIO, { sequenceId }) as Promise<string | null>,
    pickMedia: (kind: 'still' | 'video' | 'audio', projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_PICK_MEDIA, { kind, projectId }) as Promise<ImportedMediaFile[]>,
    pickStillDurations: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_PICK_STILL_DURATIONS, {}) as Promise<any>,
    exportTimelineSetup: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_EXPORT_TIMELINE_SETUP, { sequenceId }) as Promise<string | null>,
    importTimelineSetup: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_IMPORT_TIMELINE_SETUP, { sequenceId }) as Promise<any>,
    exportFullJson: (sequenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_EXPORT_FULL_JSON, { sequenceId }) as Promise<string | null>,
    importFullJson: (sequenceId: string, mode?: 'patch' | 'reconstruct') =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_IMPORT_FULL_JSON, { sequenceId, mode }) as Promise<any>,
    listMedia: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_LIST_MEDIA, { projectId }) as Promise<ImportedMediaFile[]>,
    importDroppedMedia: (projectId: string, paths: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_IMPORT_DROPPED_MEDIA, { projectId, paths }) as Promise<ImportedMediaFile[]>,
    removeMedia: (request: { projectId: string; paths: string[]; deleteClips?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_REMOVE_MEDIA, request) as Promise<{ result: RemoveImportedMediaResult; media: ImportedMediaFile[] }>,
    addTrack: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_ADD_TRACK, request) as Promise<SequenceDocument | null>,
    updateTrack: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_UPDATE_TRACK, request) as Promise<SequenceDocument | null>,
    deleteTrack: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_DELETE_TRACK, request) as Promise<SequenceDocument | null>,
    reorderTracks: (request: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEQUENCE_REORDER_TRACKS, request) as Promise<SequenceDocument | null>,
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST) as Promise<ProjectRecord[]>,
    get: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, { projectId }) as Promise<ProjectRecord | null>,
    create: (input: { name: string; aspectRatio?: AspectRatioOption; fps?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input) as Promise<ProjectRecord>,
    rename: (projectId: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_RENAME, { projectId, name }) as Promise<ProjectRecord | null>,
    delete: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, { projectId }) as Promise<void>,
    updateSettings: (projectId: string, settings: { aspectRatio?: AspectRatioOption; fps?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE_SETTINGS, { projectId, ...settings }) as Promise<ProjectRecord | null>,
  },
  veo3flow: {
    openFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.VEO3FLOW_OPEN_FOLDER) as Promise<Veo3FlowProjectData | null>,
    parseFolder: (folderPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEO3FLOW_PARSE_FOLDER, { folderPath }) as Promise<Veo3FlowProjectData>,
    ingestToProject: (folderPath: string, projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEO3FLOW_INGEST_TO_PROJECT, { folderPath, projectId }) as Promise<{
        projectData: Veo3FlowProjectData;
        recorded: ImportedMediaFile[];
      }>,
    watchFolder: (folderPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VEO3FLOW_WATCH_FOLDER, { folderPath }) as Promise<{ watching: boolean }>,
    unwatchFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.VEO3FLOW_UNWATCH_FOLDER) as Promise<{ watching: boolean }>,
  },
  dialog: {
    openFile: (options?: any) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, options),
    saveFile: (options?: any) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, options),
  },
  files: {
    showItemInFolder: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILES_SHOW_IN_FOLDER, { path }),
  },
  watermark: {
    startBatch: (payload: any) => ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_START_BATCH, payload) as Promise<any>,
    cancelBatch: () => ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_CANCEL_BATCH) as Promise<void>,
    checkCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_CHECK_CAPABILITIES) as Promise<any>,
    listPresets: () => ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_LIST_PRESETS) as Promise<any[]>,
    inpaintStatus: (): Promise<WatermarkInpaintStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_INPAINT_STATUS) as Promise<WatermarkInpaintStatus>,
    downloadModel: (): Promise<WatermarkInpaintStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_DOWNLOAD_MODEL) as Promise<WatermarkInpaintStatus>,
    removeModel: (): Promise<WatermarkInpaintStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_REMOVE_MODEL) as Promise<WatermarkInpaintStatus>,
    cancelModelDownload: () =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_CANCEL_MODEL_DOWNLOAD) as Promise<void>,
    pickExternalFiles: () =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_PICK_EXTERNAL_FILES) as Promise<any[]>,
    pickExportDir: (): Promise<{ token: string; label: string } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_PICK_EXPORT_DIR) as Promise<{ token: string; label: string } | null>,
    preview: (opts?: any) => ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_PREVIEW, opts) as Promise<any>,
    frame: (opts?: any) => ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_FRAME, opts) as Promise<any>,
    getBatch: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_GET_BATCH, { batchId: id }) as Promise<any>,
    cleanStatus: (refs: any[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.WATERMARK_CLEAN_STATUS, { refs }) as Promise<Record<string, boolean>>,
  },
  events: {
    onSequenceRenderProgress: (callback: (progress: SequenceRenderProgress) => void) =>
      subscribe<SequenceRenderProgress>(IPC_EVENTS.SEQUENCE_RENDER_PROGRESS, callback),
    onWatermarkProgress: (callback: (progress: any) => void) =>
      subscribe<any>(IPC_EVENTS.WATERMARK_PROGRESS, callback),
    onWatermarkModelDownload: (callback: (progress: any) => void) =>
      subscribe<any>(IPC_EVENTS.WATERMARK_MODEL_DOWNLOAD, callback),
    onVeo3FlowFolderUpdated: (callback: (data: Veo3FlowProjectData) => void) =>
      subscribe<Veo3FlowProjectData>(IPC_EVENTS.VEO3FLOW_FOLDER_UPDATED, callback),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type WindowApi = typeof api;
