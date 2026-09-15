import { app } from 'electron';
import path from 'node:path';

import { IPC_EVENTS, renderProgressFraction } from '@shared';

import { DatabaseService } from './db/database-service';
import { ClipProbeRepository } from './db/repositories/clip-probe-repository';
import { ProjectRepository } from './db/repositories/project-repository';
import { SequenceRepository } from './db/repositories/sequence-repository';
import { registerDialogIpc } from './ipc/dialog-ipc';
import { registerProjectsIpc } from './ipc/projects-ipc';
import { registerSequenceIpcHandlers } from './ipc/sequence-ipc';
import { registerWatermarkIpc } from './ipc/watermark-ipc';
import { Logger } from './logging/logger';
import { resolveFfmpegPath } from './media/ffmpeg-path';
import { registerMediaProtocol } from './media/media-protocol';
import { SegmentCache } from './media/segment-cache';
import { SequenceRenderService } from './media/sequence-render-service';
import { WindowManager } from './windows/window-manager';

const logger = Logger.createChildLogger('bootstrap');

export interface AppServices {
  db: DatabaseService;
  projects: ProjectRepository;
  sequences: SequenceRepository;
  probes: ClipProbeRepository;
  windowManager: WindowManager;
}

export function bootstrapApp(): AppServices {
  logger.info('Bootstrapping VideoStudio services...');

  const db = new DatabaseService();
  const dbConn = db.getConnection();

  const projects = new ProjectRepository(dbConn);
  const sequences = new SequenceRepository(dbConn);
  const probes = new ClipProbeRepository(dbConn);

  const windowManager = new WindowManager();

  const managedOutputsDir = path.join(app.getPath('userData'), 'projects');

  // Register custom media:// protocol
  registerMediaProtocol((_absolutePath: string) => true);

  const ffmpegPath = resolveFfmpegPath();
  const sequenceLogger = Logger.createChildLogger('sequence');
  const segmentLogger = Logger.createChildLogger('segment-cache');

  const renderService = new SequenceRenderService(
    ffmpegPath,
    sequenceLogger,
    (progress) => {
      windowManager.broadcast(IPC_EVENTS.SEQUENCE_RENDER_PROGRESS, progress);
      const win = windowManager.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.setProgressBar(renderProgressFraction(progress));
      }
    },
    new SegmentCache(path.join(app.getPath('userData'), 'cache', 'segments'), segmentLogger, 500 * 1024 * 1024),
  );

  // Register IPC handlers
  registerProjectsIpc(projects);
  registerDialogIpc();
  registerWatermarkIpc();
  registerSequenceIpcHandlers({
    logger: sequenceLogger,
    sequences,
    probes,
    renderer: renderService,
    managedOutputsRoot: managedOutputsDir,
    isServableMedia: (_path: string) => true,
    ffmpegPath,
    onRenderSettled: () => {
      const win = windowManager.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.setProgressBar(-1);
      }
    },
  });

  return {
    db,
    projects,
    sequences,
    probes,
    windowManager,
  };
}
