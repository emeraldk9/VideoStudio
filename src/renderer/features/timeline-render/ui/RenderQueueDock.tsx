/**
 * Milestone S68 — Render Queue Dock & Batch Delivery Drawer.
 *
 * Interactive visual drawer for monitoring, pausing, retrying, and managing
 * background sequence renders, broadcast deliveries, and audio stem export batches.
 */

import React from 'react';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { useRenderQueueStore, type RenderQueueJob } from '../model/useRenderQueueStore';

export function RenderQueueDock() {
  const isQueueDrawerOpen = useRenderQueueStore((state) => state.isQueueDrawerOpen);
  const toggleQueueDrawer = useRenderQueueStore((state) => state.toggleQueueDrawer);
  const jobs = useRenderQueueStore((state) => state.jobs);
  const isProcessing = useRenderQueueStore((state) => state.isProcessing);
  const isPaused = useRenderQueueStore((state) => state.isPaused);
  const startQueue = useRenderQueueStore((state) => state.startQueue);
  const pauseQueue = useRenderQueueStore((state) => state.pauseQueue);
  const clearCompleted = useRenderQueueStore((state) => state.clearCompleted);
  const cancelJob = useRenderQueueStore((state) => state.cancelJob);
  const retryJob = useRenderQueueStore((state) => state.retryJob);
  const removeJob = useRenderQueueStore((state) => state.removeJob);

  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  const handleReveal = (path: string) => {
    if (window.api?.files?.showItemInFolder) {
      void window.api.files.showItemInFolder(path);
    }
  };

  return (
    <Modal
      open={isQueueDrawerOpen}
      onClose={() => toggleQueueDrawer(false)}
      size="2xl"
      bodyScroll={false}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[22px]">
            format_list_bulleted
          </span>
          <span className="font-bold">Render Queue & Batch Delivery</span>
          <span className="ml-2 rounded-full bg-accent-ai/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-ai border border-accent-ai/30">
            {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}
          </span>
        </div>
      }
    >
      <div className="flex h-[540px] flex-col overflow-hidden bg-bg-canvas/50 select-none">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between border-b border-hairline bg-bg-panel/80 px-4 py-2.5 backdrop-blur-md">
          {/* Status Metrics */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span
                className={[
                  'h-2 w-2 rounded-full',
                  isProcessing
                    ? 'bg-cyan-400 animate-pulse'
                    : isPaused
                      ? 'bg-amber-400'
                      : 'bg-emerald-400',
                ].join(' ')}
              />
              <span className="font-semibold text-text-primary">
                {isProcessing ? 'Encoding...' : isPaused ? 'Queue Paused' : 'Idle'}
              </span>
            </span>

            {queuedCount > 0 && (
              <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-amber-300 border border-amber-500/20">
                {queuedCount} queued
              </span>
            )}
            {completedCount > 0 && (
              <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-emerald-300 border border-emerald-500/20">
                {completedCount} completed
              </span>
            )}
            {failedCount > 0 && (
              <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-red-300 border border-red-500/20">
                {failedCount} failed
              </span>
            )}
          </div>

          {/* Queue Actions */}
          <div className="flex items-center gap-2">
            {isPaused ? (
              <Button
                variant="primary"
                size="sm"
                className="flex items-center gap-1.5"
                onClick={() => void startQueue()}
                disabled={queuedCount === 0}
              >
                <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                <span>Start Queue</span>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="flex items-center gap-1.5"
                onClick={pauseQueue}
                disabled={!isProcessing}
              >
                <span className="material-symbols-outlined text-[15px]">pause</span>
                <span>Pause Queue</span>
              </Button>
            )}

            {completedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                onClick={clearCompleted}
              >
                <span className="material-symbols-outlined text-[15px]">clear_all</span>
                <span>Clear Completed</span>
              </Button>
            )}
          </div>
        </div>

        {/* Jobs List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {jobs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-text-secondary">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-white/40 mb-3">
                <span className="material-symbols-outlined text-3xl">playlist_add</span>
              </div>
              <h4 className="text-sm font-bold text-text-primary">Render Queue is Empty</h4>
              <p className="mt-1 text-xs max-w-sm text-text-secondary">
                Add sequences, broadcast deliveries, or audio stem batches from the Export dialog to render them in the background.
              </p>
            </div>
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onCancel={() => cancelJob(job.id)}
                onRetry={() => retryJob(job.id)}
                onRemove={() => removeJob(job.id)}
                onReveal={() => handleReveal(job.outputPath)}
              />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

interface JobCardProps {
  job: RenderQueueJob;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onReveal: () => void;
}

function JobCard({ job, onCancel, onRetry, onRemove, onReveal }: JobCardProps) {
  const isRendering = job.status === 'rendering';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isQueued = job.status === 'queued';
  const isCancelled = job.status === 'cancelled';

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-lg border p-3.5 transition-all shadow-sm',
        isRendering
          ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/30'
          : isCompleted
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : isFailed
              ? 'border-red-500/40 bg-red-500/5'
              : 'border-hairline bg-bg-panel/70',
      ].join(' ')}
    >
      {/* Card Header: Name + Presets + Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-semibold text-sm text-text-primary">
            {job.sequenceName}
          </span>
          <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-ai border border-accent-ai/30 truncate shrink-0">
            {job.presetName}
          </span>
          {job.request.stemType && (
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-purple-300 border border-purple-500/40 shrink-0">
              {job.request.stemType.toUpperCase()} STEM
            </span>
          )}
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isRendering && (
            <span className="flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-500/40 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span>{job.progress}%</span>
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/40">
              <span className="material-symbols-outlined text-[12px]">check</span>
              <span>Done</span>
            </span>
          )}
          {isFailed && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300 border border-red-500/40">
              <span className="material-symbols-outlined text-[12px]">error</span>
              <span>Failed</span>
            </span>
          )}
          {isQueued && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70 border border-white/10">
              Queued
            </span>
          )}
          {isCancelled && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40 border border-white/5">
              Cancelled
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar (Visible while rendering) */}
      {isRendering && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/60 border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-200"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-text-secondary">
            <span>{job.stage ? `Stage: ${job.stage}` : 'Encoding...'}</span>
            <span>{job.stageDetail || ''}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {isFailed && job.error && (
        <div className="rounded bg-red-500/10 p-2 font-mono text-[11px] text-red-300 border border-red-500/20 break-all">
          {job.error}
        </div>
      )}

      {/* Output Path & Action Buttons */}
      <div className="flex items-center justify-between gap-2 border-t border-hairline/60 pt-2 text-[11px]">
        <span
          className="truncate font-mono text-text-secondary text-[10px] hover:text-text-primary cursor-pointer"
          title={job.outputPath}
          onClick={isCompleted ? onReveal : undefined}
        >
          {job.outputPath}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {isCompleted && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              onClick={onReveal}
              title="Reveal file in File Explorer"
            >
              <span className="material-symbols-outlined text-[14px]">folder_open</span>
              <span>Reveal</span>
            </button>
          )}

          {(isFailed || isCancelled) && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              onClick={onRetry}
              title="Retry job"
            >
              <span className="material-symbols-outlined text-[14px]">replay</span>
              <span>Retry</span>
            </button>
          )}

          {(isRendering || isQueued) && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              onClick={onCancel}
              title="Cancel export"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              <span>Cancel</span>
            </button>
          )}

          {!isRendering && (
            <button
              type="button"
              className="flex items-center justify-center h-6 w-6 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              onClick={onRemove}
              title="Remove from queue"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
