import fs from 'node:fs';
import path from 'node:path';

import { ipcMain, type WebContents } from 'electron';

import { IPC_CHANNELS, IPC_EVENTS, IPC_SCHEMAS, type Veo3FlowProjectData } from '@shared';

import type { SequenceRepository } from '../db/repositories/sequence-repository';
import { Logger } from '../logging/logger';
import { Veo3FlowService } from '../media/veo3flow-service';

import { withValidation } from './with-validation';

const logger = Logger.createChildLogger('veo3flow-ipc');

let activeWatcher: fs.FSWatcher | null = null;
let watchedFolderPath: string | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let activeWebContents: WebContents | null = null;

function stopActiveWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (activeWatcher) {
    try {
      activeWatcher.close();
    } catch {
      // ignore
    }
    activeWatcher = null;
  }
  watchedFolderPath = null;
}

function startWatcher(folderPath: string, sender: WebContents): boolean {
  if (watchedFolderPath === folderPath && activeWatcher) {
    activeWebContents = sender;
    return true;
  }

  stopActiveWatcher();

  if (!fs.existsSync(folderPath)) {
    logger.warn('Cannot watch folder because it does not exist', { folderPath });
    return false;
  }

  try {
    activeWatcher = fs.watch(folderPath, { recursive: true }, (_eventType, filename) => {
      if (filename) {
        const basename = path.basename(filename);
        if (
          basename.startsWith('.') ||
          basename.startsWith('~') ||
          basename.endsWith('.tmp') ||
          basename.endsWith('.crdownload') ||
          basename.endsWith('.part')
        ) {
          return;
        }
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        if (!activeWebContents || activeWebContents.isDestroyed() || !watchedFolderPath) {
          return;
        }
        try {
          logger.info('Live sync triggered for story folder', { folderPath: watchedFolderPath });
          const updatedData = await Veo3FlowService.parseProjectFolder(watchedFolderPath);
          if (!activeWebContents.isDestroyed()) {
            activeWebContents.send(IPC_EVENTS.VEO3FLOW_FOLDER_UPDATED, updatedData);
          }
        } catch (err) {
          logger.warn('Failed to parse folder on live sync update', { err });
        }
      }, 500);
    });

    activeWatcher.on('error', (err) => {
      logger.warn('Story folder watcher encountered an error', { err });
    });

    watchedFolderPath = folderPath;
    activeWebContents = sender;
    logger.info('Started live watcher for story folder', { folderPath });
    return true;
  } catch (err) {
    logger.warn('Failed to start story folder watcher', { folderPath, err });
    return false;
  }
}

export function registerVeo3FlowIpc(sequences: SequenceRepository): void {
  ipcMain.handle(
    IPC_CHANNELS.VEO3FLOW_OPEN_FOLDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_OPEN_FOLDER],
      async (event): Promise<Veo3FlowProjectData | null> => {
        logger.info('VEO3FLOW_OPEN_FOLDER requested');
        const folderPath = await Veo3FlowService.pickFolder();
        if (!folderPath) {
          logger.info('User cancelled folder selection');
          return null;
        }
        logger.info('Parsing chosen Veo3Flow folder', { folderPath });
        const data = await Veo3FlowService.parseProjectFolder(folderPath);
        startWatcher(folderPath, event.sender);
        return data;
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.VEO3FLOW_PARSE_FOLDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_PARSE_FOLDER],
      async (event, payload): Promise<Veo3FlowProjectData> => {
        logger.info('VEO3FLOW_PARSE_FOLDER requested', { folderPath: payload.folderPath });
        const data = await Veo3FlowService.parseProjectFolder(payload.folderPath);
        startWatcher(payload.folderPath, event.sender);
        return data;
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.VEO3FLOW_INGEST_TO_PROJECT,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_INGEST_TO_PROJECT],
      async (event, payload) => {
        logger.info('VEO3FLOW_INGEST_TO_PROJECT requested', {
          folderPath: payload.folderPath,
          projectId: payload.projectId,
        });
        const projectData = await Veo3FlowService.parseProjectFolder(payload.folderPath);
        const recorded = await Veo3FlowService.ingestMediaToProject(
          projectData,
          payload.projectId,
          sequences,
        );
        startWatcher(payload.folderPath, event.sender);
        logger.info('Ingested Veo3Flow media to project', {
          projectId: payload.projectId,
          recordedCount: recorded.length,
        });
        return { projectData, recorded };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.VEO3FLOW_WATCH_FOLDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_WATCH_FOLDER],
      async (event, payload): Promise<{ watching: boolean }> => {
        logger.info('VEO3FLOW_WATCH_FOLDER requested', { folderPath: payload.folderPath });
        const watching = startWatcher(payload.folderPath, event.sender);
        return { watching };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.VEO3FLOW_UNWATCH_FOLDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_UNWATCH_FOLDER],
      async (): Promise<{ watching: boolean }> => {
        logger.info('VEO3FLOW_UNWATCH_FOLDER requested');
        stopActiveWatcher();
        return { watching: false };
      },
    ),
  );
}

