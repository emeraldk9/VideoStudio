import { useEffect } from 'react';

import { useSequenceStore } from '../entities/sequence';
import { useVeo3FlowStore } from '../entities/veo3flow/model/veo3flowStore';
import { useWatermarkStore } from '../features/watermark-removal/model/watermarkStore';
import { useWatermarkProgressStore } from '../shared/model/watermarkProgressStore';

/**
 * Global IPC Synchronizer.
 *
 * Subscribes once at the application root to asynchronous main-process events:
 * - Sequence render progress & ETA
 * - Watermark batch cleaning progress
 * - Watermark inpaint model download progress
 * - Veo3Flow story studio folder updates
 */
export function useIpcSynchronizer(): void {
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // 1. Sequence render progress
    if (window.api?.events?.onSequenceRenderProgress) {
      unsubs.push(
        window.api.events.onSequenceRenderProgress((progress) => {
          useSequenceStore.getState().setRenderProgress(progress);
        }),
      );
    }

    // 2. Watermark batch removal progress
    if (window.api?.events?.onWatermarkProgress) {
      unsubs.push(
        window.api.events.onWatermarkProgress((progress) => {
          useWatermarkProgressStore.getState().setProgress(progress);
        }),
      );
    }

    // 3. Watermark AI model download progress
    if (window.api?.events?.onWatermarkModelDownload) {
      unsubs.push(
        window.api.events.onWatermarkModelDownload((download) => {
          useWatermarkStore.getState().setModelDownload(download);
        }),
      );
    }

    // 4. Veo3Flow story folder updates
    if (window.api?.events?.onVeo3FlowFolderUpdated) {
      unsubs.push(
        window.api.events.onVeo3FlowFolderUpdated((data) => {
          useVeo3FlowStore.getState().handleFolderUpdated(data);
        }),
      );
    }

    return () => {
      for (const unsub of unsubs) {
        try {
          unsub();
        } catch {}
      }
    };
  }, []);
}
