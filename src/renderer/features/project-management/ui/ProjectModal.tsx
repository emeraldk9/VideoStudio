import { useState } from 'react';

import type { AspectRatioOption } from '@shared';

import { useProjectStore } from '../../../entities/project';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';

export interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ASPECT_OPTIONS: { value: AspectRatioOption; label: string }[] = [
  { value: '16:9', label: '16:9 (Landscape - YouTube, TV)' },
  { value: '9:16', label: '9:16 (Vertical - TikTok, Shorts, Reels)' },
  { value: '1:1', label: '1:1 (Square - Instagram)' },
  { value: '4:5', label: '4:5 (Portrait - Social Media)' },
  { value: '21:9', label: '21:9 (Ultrawide / Cinema)' },
];

export function ProjectModal({ isOpen, onClose }: ProjectModalProps) {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const createProject = useProjectStore((state) => state.createProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);

  const [tab, setTab] = useState<'switch' | 'new'>('new');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('16:9');
  const [fps, setFps] = useState<number>(30);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createProject({
        name: name.trim(),
        aspectRatio,
        fps,
      });
      setName('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={tab === 'new' ? 'New Project' : 'Select Project'}
    >
      <div className="flex flex-col gap-4">
        {tab === 'new' ? (
        <div className="flex flex-col gap-4 py-2">
          <div>
            <label className="text-xs font-medium text-text-secondary">Project Name</label>
            <input
              type="text"
              placeholder="My Video Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-input border border-hairline bg-bg-app px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-ai"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary">Aspect Ratio</label>
            <Select
              className="mt-1"
              value={aspectRatio}
              options={ASPECT_OPTIONS}
              onChange={(val) => setAspectRatio(val as AspectRatioOption)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary">Frame Rate (FPS)</label>
            <Select
              className="mt-1"
              value={String(fps)}
              options={[
                { value: '24', label: '24 fps (Cinematic)' },
                { value: '25', label: '25 fps (PAL / Europe)' },
                { value: '30', label: '30 fps (Standard Web/Social)' },
                { value: '60', label: '60 fps (Smooth / High Frame Rate)' },
              ]}
              onChange={(val) => setFps(Number(val))}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto py-2">
          {projects.map((proj) => {
            const isCurrent = proj.id === activeProjectId;
            return (
              <div
                key={proj.id}
                className={`flex items-center justify-between rounded-card p-3 border transition-colors ${
                  isCurrent
                    ? 'border-accent-ai bg-bg-selected'
                    : 'border-hairline bg-bg-app hover:bg-bg-hover'
                }`}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => {
                    setActiveProject(proj.id);
                    onClose();
                  }}
                >
                  <div className="text-sm font-medium text-text-primary">{proj.name}</div>
                  <div className="text-xs text-text-secondary">
                    {proj.aspectRatio} • {proj.fps} fps • {new Date(proj.updatedAt).toLocaleDateString()}
                  </div>
                </button>
                {projects.length > 1 && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void deleteProject(proj.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

        <div className="flex justify-between w-full pt-4 border-t border-hairline mt-2">
          <Button
            variant="secondary"
            onClick={() => setTab(tab === 'new' ? 'switch' : 'new')}
          >
            {tab === 'new' ? 'Switch Existing Project' : '+ Create New Project'}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {tab === 'new' && (
              <Button
                variant="primary"
                disabled={!name.trim() || busy}
                onClick={() => void handleCreate()}
              >
                Create Project
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
