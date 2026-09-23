/**
 * Beta S154 — the media pool: the merge of S151's `timeline-bin` and S145's
 * `timeline-assemble` into one slice, because they became one user-facing
 * capability (browse source media and place it on the timeline) and FSD
 * forbids sibling slices sharing the grid and tile components they both need.
 */
export { MediaPanel } from './ui/MediaPanel';
export { useMediaPanelStore, type MediaPanelCategory } from './lib/mediaPanelStore';
// S180 — the pool's Library/Imported pane. Exported for its own tests: the
// removal contract it enforces is worth pinning directly rather than through
// `MediaPanel`'s rail and source state, the same reason `timeline-edit`
// exports `ClipInspector`.
export { FilesPane } from './ui/FilesPane';
export { TransitionsPane } from './ui/TransitionsPane';
export { TextPane } from './ui/TextPane';
export { SubtitlesPane } from './ui/SubtitlesPane';
export { EffectsPane } from './ui/EffectsPane';
export { FiltersPane } from './ui/FiltersPane';
