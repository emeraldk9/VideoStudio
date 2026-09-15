import { ipcMain } from 'electron';

import { IPC_CHANNELS, IPC_SCHEMAS, type ProjectRecord } from '@shared';

import type { ProjectRepository } from '../db/repositories/project-repository';

import { withValidation } from './with-validation';

export function registerProjectsIpc(projects: ProjectRepository): void {
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LIST,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.PROJECT_LIST], (): ProjectRecord[] => {
      return projects.list();
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_GET,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.PROJECT_GET],
      (_event, payload): ProjectRecord | null => {
        return projects.get(payload.projectId);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.PROJECT_CREATE], (_event, payload): ProjectRecord => {
      return projects.create(payload);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_RENAME,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.PROJECT_RENAME],
      (_event, payload): ProjectRecord | null => {
        return projects.rename(payload.projectId, payload.name);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.PROJECT_DELETE], (_event, payload): void => {
      projects.delete(payload.projectId);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_SETTINGS,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.PROJECT_UPDATE_SETTINGS],
      (_event, payload): ProjectRecord | null => {
        return projects.updateSettings(payload.projectId, payload);
      },
    ),
  );
}
