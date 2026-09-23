/**
 * Milestone S68 — Background Render Queue Manager.
 *
 * Provides persistent background queue management, sequential batch export execution,
 * real-time stage progress monitoring, job retry/cancel controls, and separated
 * audio stem delivery orchestration.
 */

import { create } from 'zustand';
import type { SequenceRenderProgress, SequenceRenderRequest } from '@shared';

export type RenderJobStatus = 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled';

export interface RenderQueueJob {
  id: string;
  sequenceId: string;
  sequenceName: string;
  presetName: string;
  request: SequenceRenderRequest;
  status: RenderJobStatus;
  progress: number; // 0 to 100
  stage?: string;
  stageDetail?: string;
  durationSeconds?: number;
  outputPath: string;
  error?: string;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface RenderQueueStoreState {
  jobs: RenderQueueJob[];
  activeJobId: string | null;
  isProcessing: boolean;
  isPaused: boolean;
  isQueueDrawerOpen: boolean;

  // Actions
  enqueueJob: (job: Omit<RenderQueueJob, 'id' | 'status' | 'progress' | 'addedAt'>) => string;
  enqueueBatch: (jobs: Array<Omit<RenderQueueJob, 'id' | 'status' | 'progress' | 'addedAt'>>) => string[];
  removeJob: (jobId: string) => void;
  clearCompleted: () => void;
  startQueue: () => Promise<void>;
  pauseQueue: () => void;
  cancelJob: (jobId: string) => void;
  retryJob: (jobId: string) => void;
  toggleQueueDrawer: (open?: boolean) => void;
  updateActiveProgress: (progress: SequenceRenderProgress) => void;
}

export const useRenderQueueStore = create<RenderQueueStoreState>((set, get) => {
  // Sequential queue runner
  const processNextInQueue = async () => {
    const { jobs, isPaused, isProcessing } = get();
    if (isPaused || isProcessing) return;

    const nextJob = jobs.find((j) => j.status === 'queued');
    if (!nextJob) {
      set({ isProcessing: false, activeJobId: null });
      return;
    }

    set({
      isProcessing: true,
      activeJobId: nextJob.id,
      jobs: get().jobs.map((j) =>
        j.id === nextJob.id ? { ...j, status: 'rendering' as const, startedAt: Date.now(), progress: 0 } : j,
      ),
    });

    try {
      if (window.api?.sequence?.render) {
        const result = await window.api.sequence.render(nextJob.request);
        set({
          jobs: get().jobs.map((j) =>
            j.id === nextJob.id
              ? {
                  ...j,
                  status: 'completed' as const,
                  progress: 100,
                  completedAt: Date.now(),
                  durationSeconds: result.durationSeconds,
                }
              : j,
          ),
        });
      }
    } catch (err) {
      const isCancelled = get().jobs.find((j) => j.id === nextJob.id)?.status === 'cancelled';
      if (!isCancelled) {
        set({
          jobs: get().jobs.map((j) =>
            j.id === nextJob.id
              ? {
                  ...j,
                  status: 'failed' as const,
                  error: err instanceof Error ? err.message : String(err),
                  completedAt: Date.now(),
                }
              : j,
          ),
        });
      }
    } finally {
      set({ isProcessing: false, activeJobId: null });
      // Trigger next job if queue is still running
      if (!get().isPaused) {
        void processNextInQueue();
      }
    }
  };

  return {
    jobs: [],
    activeJobId: null,
    isProcessing: false,
    isPaused: false,
    isQueueDrawerOpen: false,

    enqueueJob: (item) => {
      const id = crypto.randomUUID();
      const newJob: RenderQueueJob = {
        ...item,
        id,
        status: 'queued',
        progress: 0,
        addedAt: Date.now(),
      };
      set((state) => ({ jobs: [...state.jobs, newJob] }));
      if (!get().isPaused && !get().isProcessing) {
        void processNextInQueue();
      }
      return id;
    },

    enqueueBatch: (items) => {
      const newJobs: RenderQueueJob[] = items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        status: 'queued',
        progress: 0,
        addedAt: Date.now(),
      }));
      set((state) => ({ jobs: [...state.jobs, ...newJobs] }));
      if (!get().isPaused && !get().isProcessing) {
        void processNextInQueue();
      }
      return newJobs.map((j) => j.id);
    },

    removeJob: (jobId) => {
      const job = get().jobs.find((j) => j.id === jobId);
      if (job?.status === 'rendering') {
        void window.api?.sequence?.cancelRender?.();
      }
      set((state) => ({
        jobs: state.jobs.filter((j) => j.id !== jobId),
        activeJobId: state.activeJobId === jobId ? null : state.activeJobId,
      }));
    },

    clearCompleted: () => {
      set((state) => ({
        jobs: state.jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled'),
      }));
    },

    startQueue: async () => {
      set({ isPaused: false });
      await processNextInQueue();
    },

    pauseQueue: () => {
      set({ isPaused: true });
    },

    cancelJob: (jobId) => {
      const job = get().jobs.find((j) => j.id === jobId);
      if (job?.status === 'rendering') {
        void window.api?.sequence?.cancelRender?.();
      }
      set((state) => ({
        jobs: state.jobs.map((j) =>
          j.id === jobId ? { ...j, status: 'cancelled' as const, completedAt: Date.now() } : j,
        ),
        activeJobId: state.activeJobId === jobId ? null : state.activeJobId,
      }));
    },

    retryJob: (jobId) => {
      set((state) => ({
        jobs: state.jobs.map((j) =>
          j.id === jobId
            ? { ...j, status: 'queued' as const, progress: 0, error: undefined, completedAt: undefined }
            : j,
        ),
      }));
      if (!get().isPaused && !get().isProcessing) {
        void processNextInQueue();
      }
    },

    toggleQueueDrawer: (open) => {
      set((state) => ({ isQueueDrawerOpen: open !== undefined ? open : !state.isQueueDrawerOpen }));
    },

    updateActiveProgress: (progress) => {
      const { activeJobId } = get();
      if (!activeJobId) return;
      const pct = Math.min(100, Math.max(0, Math.round((progress.completed / Math.max(1, progress.total)) * 100)));
      set((state) => ({
        jobs: state.jobs.map((j) =>
          j.id === activeJobId
            ? {
                ...j,
                progress: pct,
                stage: progress.stage,
                stageDetail: progress.detail,
              }
            : j,
        ),
      }));
    },
  };
});
