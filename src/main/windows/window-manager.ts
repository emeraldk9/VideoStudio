import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';

import { Logger } from '../logging/logger';

const logger = Logger.createChildLogger('window-manager');

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.focus();
      return this.mainWindow;
    }

    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      backgroundColor: '#0c0e12',
      title: 'VideoStudio',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0c0e12',
        symbolColor: '#94a3b8',
        height: 36,
      },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        sandbox: true,
        contextIsolation: true,
      },
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https:') || url.startsWith('http:')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('Renderer failed to load', { errorCode, errorDescription, validatedURL });
    });

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      logger.info(`[renderer:${level}] ${message}`, { line, sourceId });
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    win.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow = win;
    logger.info('Created main window');
    return win;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null;
  }

  broadcast(channel: string, payload: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }
}
