export const IPC_CHANNELS = {
  // Sequence
  SEQUENCE_LIST: 'sequence:list',
  SEQUENCE_GET: 'sequence:get',
  SEQUENCE_CREATE: 'sequence:create',
  SEQUENCE_RENAME: 'sequence:rename',
  SEQUENCE_DELETE: 'sequence:delete',
  SEQUENCE_UPDATE_SETTINGS: 'sequence:updateSettings',
  SEQUENCE_REPLACE_CLIPS: 'sequence:replaceClips',
  SEQUENCE_REPLACE_DOCUMENT: 'sequence:replaceDocument',
  SEQUENCE_LIST_MARKERS: 'sequence:listMarkers',
  SEQUENCE_ADD_MARKER: 'sequence:addMarker',
  SEQUENCE_UPDATE_MARKER: 'sequence:updateMarker',
  SEQUENCE_DELETE_MARKER: 'sequence:deleteMarker',
  SEQUENCE_PROBE_SOURCES: 'sequence:probeSources',
  SEQUENCE_GET_PEAKS: 'sequence:getPeaks',
  SEQUENCE_TRACE_WHITEBOARD: 'sequence:traceWhiteboard',
  SEQUENCE_GET_FILMSTRIP: 'sequence:getFilmstrip',
  SEQUENCE_GET_ENCODER: 'sequence:getEncoder',
  SEQUENCE_RENDER: 'sequence:render',
  SEQUENCE_CANCEL_RENDER: 'sequence:cancelRender',
  SEQUENCE_ACTIVE_RENDER: 'sequence:activeRender',
  SEQUENCE_CHOOSE_EXPORT_PATH: 'sequence:chooseExportPath',
  SEQUENCE_EXPORT_OTIO: 'sequence:exportOtio',
  SEQUENCE_PICK_MEDIA: 'sequence:pickMedia',
  SEQUENCE_PICK_STILL_DURATIONS: 'sequence:pickStillDurations',
  SEQUENCE_EXPORT_TIMELINE_SETUP: 'sequence:exportTimelineSetup',
  SEQUENCE_IMPORT_TIMELINE_SETUP: 'sequence:importTimelineSetup',
  SEQUENCE_LIST_MEDIA: 'sequence:listMedia',
  SEQUENCE_IMPORT_DROPPED_MEDIA: 'sequence:importDroppedMedia',
  SEQUENCE_REMOVE_MEDIA: 'sequence:removeMedia',
  SEQUENCE_ADD_TRACK: 'sequence:addTrack',
  SEQUENCE_UPDATE_TRACK: 'sequence:updateTrack',
  SEQUENCE_DELETE_TRACK: 'sequence:deleteTrack',
  SEQUENCE_REORDER_TRACKS: 'sequence:reorderTracks',

  // Projects
  PROJECT_LIST: 'projects:list',
  PROJECT_GET: 'projects:get',
  PROJECT_CREATE: 'projects:create',
  PROJECT_RENAME: 'projects:rename',
  PROJECT_DELETE: 'projects:delete',
  PROJECT_UPDATE_SETTINGS: 'projects:updateSettings',

  // Watermark
  WATERMARK_START_BATCH: 'watermark:startBatch',
  WATERMARK_CANCEL_BATCH: 'watermark:cancelBatch',
  WATERMARK_CHECK_CAPABILITIES: 'watermark:checkCapabilities',

  // Dialogs & Files
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SAVE_FILE: 'dialog:saveFile',
  FILES_SHOW_IN_FOLDER: 'files:showInFolder',

  // System
  APP_GET_VERSION: 'app:getVersion',
} as const;

export const IPC_EVENTS = {
  SEQUENCE_RENDER_PROGRESS: 'sequence:renderProgress',
  WATERMARK_PROGRESS: 'watermark:progress',
} as const;
