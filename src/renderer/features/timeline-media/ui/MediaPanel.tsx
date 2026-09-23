import type { ReactNode } from 'react';

import { EffectsPane } from './EffectsPane';
import { FilesPane } from './FilesPane';
import { FiltersPane } from './FiltersPane';
import { SketchPane } from './SketchPane';
import { TextPane } from './TextPane';
import { TransitionsPane } from './TransitionsPane';

import { useMediaPanelStore, type MediaPanelCategory } from '../lib/mediaPanelStore';

const RAIL: { id: MediaPanelCategory; icon: string; label: string }[] = [
  { id: 'media', icon: 'perm_media', label: 'Media' },
  { id: 'transitions', icon: 'auto_awesome_motion', label: 'Transitions' },
  { id: 'text', icon: 'title', label: 'Text' },
  { id: 'effects', icon: 'auto_fix_high', label: 'Effects' },
  { id: 'filters', icon: 'photo_filter', label: 'Filters' },
  { id: 'sketch', icon: 'draw', label: 'Sketch' },
];

export interface MediaPanelProps {
  exportPanel?: ReactNode;
}

export function MediaPanel({ exportPanel }: MediaPanelProps = {}) {
  const category = useMediaPanelStore((state) => state.category);
  const setCategory = useMediaPanelStore((state) => state.setCategory);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-app">
      {/* Top Horizontal Module Navigation Rail (CapCut Desktop style) */}
      <nav
        aria-label="Media pool modules"
        className="flex shrink-0 items-center gap-0.5 border-b border-hairline bg-bg-sidebar/90 px-2 pt-1 select-none overflow-x-auto no-scrollbar"
        style={{ minHeight: '38px' }}
      >
        {RAIL.map((entry) => {
          const active = category === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              className={`group relative flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'bg-bg-canvas text-accent-ai font-semibold'
                  : 'text-text-secondary hover:bg-bg-hover/60 hover:text-text-primary'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[17px] transition-colors ${
                  active ? 'text-accent-ai' : 'text-text-secondary group-hover:text-text-primary'
                }`}
              >
                {entry.icon}
              </span>
              <span>{entry.label}</span>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-accent-ai"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Module Content Pane */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-bg-canvas">
        {category === 'media' && <FilesPane />}
        {category === 'transitions' && <TransitionsPane />}
        {category === 'text' && <TextPane />}
        {category === 'effects' && <EffectsPane />}
        {category === 'filters' && <FiltersPane />}
        {category === 'sketch' && <SketchPane />}
      </div>
    </div>
  );
}
