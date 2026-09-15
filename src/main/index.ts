import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';

import { bootstrapApp, type AppServices } from './bootstrap';
import { Logger } from './logging/logger';
import { registerMediaProtocolScheme } from './media/media-protocol';

const logger = Logger.createChildLogger('main');

if (started) {
  app.quit();
}

if (app.isPackaged && !app.requestSingleInstanceLock()) {
  logger.warn('Another instance is already running; quitting.');
  app.quit();
  process.exit(0);
}

registerMediaProtocolScheme();

let services: AppServices | null = null;

app.on('second-instance', () => {
  const win = services?.windowManager.getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  } else {
    services?.windowManager.createMainWindow();
  }
});

app.whenReady().then(() => {
  services = bootstrapApp();
  services.windowManager.createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      services?.windowManager.createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
