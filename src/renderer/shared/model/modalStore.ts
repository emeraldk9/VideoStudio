import { create } from 'zustand';

import type { WatermarkSourceRef } from '@shared/types/watermark';

export interface WatermarkBatchSource extends WatermarkSourceRef {
  label: string;
  sourcePath?: string;
  mediaType?: 'image' | 'video';
}

export interface ModalState {
  activeModal: string | null;
  watermarkBatchSources: WatermarkBatchSource[];
  openModal: (id: string) => void;
  closeModal: () => void;
  openWatermarkBatchModal: (sources: WatermarkBatchSource[]) => void;
  closeWatermarkBatchModal: () => void;
  takeWatermarkBatchSources: () => WatermarkBatchSource[];
  setPopoverOpen: (id: string, open: boolean) => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  activeModal: null,
  watermarkBatchSources: [],

  openModal: (id: string) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),

  openWatermarkBatchModal: (sources: WatermarkBatchSource[]) =>
    set({ activeModal: 'watermark-batch', watermarkBatchSources: sources }),
  closeWatermarkBatchModal: () =>
    set((state) => (state.activeModal === 'watermark-batch' ? { activeModal: null } : {})),
  takeWatermarkBatchSources: () => {
    const sources = get().watermarkBatchSources;
    set({ watermarkBatchSources: [] });
    return sources;
  },
  setPopoverOpen: (_id: string, _open: boolean) => {
    // No-op in VideoStudio standalone
  },
}));
