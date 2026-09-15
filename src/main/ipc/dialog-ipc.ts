import { app, ipcMain, shell } from 'electron';

import { IPC_CHANNELS, IPC_SCHEMAS } from '@shared';

import { showOpenDialog, showSaveDialog } from '../windows/native-dialog';

import { withValidation } from './with-validation';

export function registerDialogIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.DIALOG_OPEN_FILE],
      async (_event, payload) => {
        return showOpenDialog({
          title: payload?.title,
          filters: payload?.filters,
          properties: (payload?.properties as any) ?? ['openFile'],
        });
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SAVE_FILE,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.DIALOG_SAVE_FILE],
      async (_event, payload) => {
        return showSaveDialog({
          title: payload?.title,
          defaultPath: payload?.defaultPath,
          filters: payload?.filters,
        });
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.FILES_SHOW_IN_FOLDER,
    withValidation(
      IPC_SCHEMAS[IPC_CHANNELS.FILES_SHOW_IN_FOLDER],
      (_event, payload) => {
        shell.showItemInFolder(payload.path);
      },
    ),
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });
}
