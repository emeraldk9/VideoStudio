import { ipcMain } from 'electron';

import { IPC_CHANNELS, IPC_SCHEMAS } from '@shared';

import { resolveFfmpegPath } from '../media/ffmpeg-path';
import { probeFfmpegCapabilities } from '../media/watermark-capabilities';
import { WATERMARK_PRESETS } from '../media/watermark-region';

import { withValidation } from './with-validation';

export function registerWatermarkIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_CHECK_CAPABILITIES,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CHECK_CAPABILITIES], async () => {
      const caps = await probeFfmpegCapabilities(resolveFfmpegPath());
      return {
        ...caps,
        presets: WATERMARK_PRESETS,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_START_BATCH,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_START_BATCH], async (_event, payload) => {
      return {
        id: 'batch-' + Date.now(),
        status: 'completed',
        items: payload.items,
      };
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.WATERMARK_CANCEL_BATCH,
    withValidation(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CANCEL_BATCH], async () => {
      return;
    }),
  );
}
