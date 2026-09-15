import { useState, type ReactNode } from 'react';

import type { MediaSourceKind } from '@shared';

import { TypeTabs } from '../../../shared/ui/TypeTabs';

import { EffectsPane } from './EffectsPane';
import { FilesPane } from './FilesPane';
import { SketchPane } from './SketchPane';
import { TextPane } from './TextPane';
import { TransitionsPane } from './TransitionsPane';

import { useMediaPanelStore, type MediaPanelCategory } from '../lib/mediaPanelStore';

type PoolKind = MediaSourceKind;
const TYPE_ORDER = ['video', 'audio', 'still'] as const;
const TYPE_LABELS: Record<PoolKind, string> = {
  video: 'Videos',
  audio: 'Audio',
  still: 'Stills',
};
const TYPE_ICONS: Record<PoolKind, string> = {
  video: 'movie',
  audio: 'graphic_eq',
  still: 'image',
};

const RAIL: { id: MediaPanelCategory; icon: string; label: string }[] = [
  { id: 'media', icon: 'perm_media', label: 'Media' },
  { id: 'transitions', icon: 'auto_awesome_motion', label: 'Transitions' },
  { id: 'text', icon: 'title', label: 'Text' },
  { id: 'effects', icon: 'auto_fix_high', label: 'Effects' },
  { id: 'sketch', icon: 'draw', label: 'Sketch' },
  { id: 'export', icon: 'download', label: 'Export' },
];

export interface MediaPanelProps {
  exportPanel?: ReactNode;
}

export function MediaPanel({ exportPanel }: MediaPanelProps) {
  const category = useMediaPanelStore((state) => state.category);
  const setCategory = useMediaPanelStore((state) => state.setCategory);
  const [activeKind, setActiveKind] = useState<PoolKind>('video');

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-app">
      {/* Category navigation rail */}
      <nav
        aria-label="Media pool category"
        className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-hairline bg-bg-sidebar py-3"
      >
        {RAIL.map((entry) => {
          const active = category === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              className={`group relative flex w-13 flex-col items-center justify-center gap-1 rounded-card py-2 text-center transition-all duration-150 ${
                active
                  ? 'bg-bg-selected text-text-primary shadow-sm'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -left-1.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent-ai"
                />
              )}
              <span className={`material-symbols-outlined text-[20px] transition-transform duration-150 ${active ? 'scale-105 text-accent-ai' : 'group-hover:scale-105'}`}>
                {entry.icon}
              </span>
              <span className="text-[10px] font-medium tracking-tight leading-none">
                {entry.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Pane Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-canvas">
        {category === 'media' && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-hairline px-3 py-2">
              <TypeTabs
                order={TYPE_ORDER}
                active={activeKind}
                labels={TYPE_LABELS}
                icons={TYPE_ICONS}
                ariaLabel="Media types"
                onChange={(type) => setActiveKind(type as MediaSourceKind)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <FilesPane sourceKind={activeKind} />
            </div>
          </div>
        )}

        {category === 'transitions' && <TransitionsPane />}
        {category === 'text' && <TextPane />}
        {category === 'effects' && <EffectsPane />}
        {category === 'sketch' && <SketchPane />}
        {category === 'export' && (
          <div className="flex h-full flex-col overflow-y-auto p-4">
            {exportPanel ?? <p className="text-sm text-text-secondary">Export panel</p>}
          </div>
        )}
      </div>
    </div>
  );
}
