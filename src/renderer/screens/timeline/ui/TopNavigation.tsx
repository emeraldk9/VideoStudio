import { useEffect, useState } from 'react';

import type { AspectRatioOption } from '@shared';

import { useProjectStore } from '../../../entities/project';
import { useSequenceStore } from '../../../entities/sequence';
import { ProjectModal } from '../../../features/project-management/ui/ProjectModal';
import { SettingsModal } from '../../../features/settings';
import { TimelineJsonModal } from '../../../features/timeline-edit/ui/TimelineJsonModal';
import { ExportModal, useRenderQueueStore } from '../../../features/timeline-render';
import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';

const ASPECT_DIMENSIONS: Record<AspectRatioOption, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '21:9': { width: 2560, height: 1080 },
};

export function TopNavigation() {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const updateProjectSettings = useProjectStore((state) => state.updateSettings);
  const updateSequenceSettings = useSequenceStore((state) => state.updateSettings);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const undo = useSequenceStore((state) => state.undo);
  const redo = useSequenceStore((state) => state.redo);
  const canUndo = useSequenceStore((state) => state.undoStack.length > 0);
  const canRedo = useSequenceStore((state) => state.redoStack.length > 0);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [jsonModalOpen, setJsonModalOpen] = useState(false);

  const queueCount = useRenderQueueStore((state) => state.jobs.length);
  const isRenderingQueue = useRenderQueueStore((state) =>
    state.jobs.some((j) => j.status === 'rendering'),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === ',') {
        event.preventDefault();
        setSettingsOpen((prev) => !prev);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'e') {
        event.preventDefault();
        setExportOpen((prev) => !prev);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleAspectChange = (aspectRatio: AspectRatioOption) => {
    if (activeProjectId) {
      void updateProjectSettings(activeProjectId, { aspectRatio });
    }
    const dims = ASPECT_DIMENSIONS[aspectRatio];
    if (dims) {
      void updateSequenceSettings(dims);
    }
  };

  return (
    <>
      <header
        className="flex shrink-0 select-none items-center justify-between border-b border-hairline bg-bg-app px-3.5 transition-colors"
        style={{ height: '42px', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Branding & Project Selector */}
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-2 group cursor-default">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-ai/15 text-accent-ai">
              <span className="material-symbols-outlined text-[17px]">movie_filter</span>
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-text-primary">
              Video<span className="text-accent-ai">Studio</span>
            </span>
          </div>

          <div className="h-4 w-px bg-hairline" />

          {/* Project Switcher Pill */}
          <button
            type="button"
            onClick={() => setProjectModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-hairline bg-bg-canvas/80 px-3 py-1 text-xs font-medium text-text-primary hover:bg-bg-hover hover:border-text-disabled transition-all"
            title="Switch or manage projects"
          >
            <span className="material-symbols-outlined text-[14px] text-text-secondary">folder</span>
            <span className="max-w-[140px] truncate font-medium text-text-primary">
              {activeProject?.name ?? 'Default Project'}
            </span>
            <span className="material-symbols-outlined text-[15px] text-text-disabled">expand_more</span>
          </button>

        </div>

        {/* Center: Aspect Ratio & Undo/Redo */}
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center gap-0.5 rounded-card border border-hairline bg-bg-canvas p-0.5">
            {(['16:9', '9:16', '1:1', '4:5', '21:9'] as AspectRatioOption[]).map((aspect) => {
              const active = (activeProject?.aspectRatio ?? '16:9') === aspect;
              return (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => handleAspectChange(aspect)}
                  className={`rounded-button px-2.5 py-1 text-[11px] font-medium transition-all ${
                    active
                      ? 'bg-bg-selected text-text-primary font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                  }`}
                  title={`Switch sequence to ${aspect}`}
                >
                  {aspect}
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-hairline" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <IconButton
              icon="undo"
              label="Undo (Ctrl+Z)"
              size="sm"
              disabled={!canUndo}
              onClick={undo}
            />
            <IconButton
              icon="redo"
              label="Redo (Ctrl+Y)"
              size="sm"
              disabled={!canRedo}
              onClick={redo}
            />
          </div>
        </div>

        {/* Right: Settings, Export & Window Controls spacing */}
        <div className="flex items-center gap-2 pr-36" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Timeline JSON Control */}
          <IconButton
            icon="data_object"
            label="Timeline JSON Control (Export / Import)"
            size="sm"
            onClick={() => setJsonModalOpen(true)}
          />

          <IconButton
            icon="settings"
            label="Settings (Ctrl+,)"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          />

          <IconButton
            icon={isRenderingQueue ? 'sync' : 'queue_play_next'}
            label={`Render Queue${queueCount > 0 ? ` (${queueCount})` : ''}`}
            size="sm"
            className={isRenderingQueue ? 'text-accent-ai animate-spin' : queueCount > 0 ? 'text-accent-ai' : undefined}
            onClick={() => useRenderQueueStore.getState().toggleQueueDrawer(true)}
          />

          <Button
            size="sm"
            variant="primary"
            className="flex items-center gap-1.5 font-medium"
            onClick={() => setExportOpen(true)}
          >
            <span className="material-symbols-outlined text-[16px]">ios_share</span>
            <span>Export</span>
          </Button>
        </div>
      </header>

      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />

      <TimelineJsonModal
        isOpen={jsonModalOpen}
        onClose={() => setJsonModalOpen(false)}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </>
  );
}
