import { useShallow } from 'zustand/react/shallow';
import {
  useSequenceStore,
  selectDurationFrames,
  selectSelectedClip,
  selectSelectedClips,
} from '../../../entities/sequence';
import { MultiClipInspector } from './inspector/MultiClipInspector';
import { SequenceOverviewCard } from './inspector/SequenceOverviewCard';
import { SingleClipInspector } from './inspector/SingleClipInspector';

/**
 * Beta S145 / S61 — properties of the selected clip.
 * Modular orchestrator delegating to specialized, memoized inspector components:
 * - MultiClipInspector: batch editing across multi-selections
 * - SequenceOverviewCard: global sequence properties and marker navigation
 * - SingleClipInspector: individual clip inspection with dedicated sub-tabs
 */
export function ClipInspector() {
  const clip = useSequenceStore(selectSelectedClip);
  // `useShallow` is load-bearing (S162): the selector returns a fresh array
  // whenever anything is selected, and without shallow comparison zustand v5's
  // unmemoised `getSnapshot` render-loops until React throws "Maximum update
  // depth exceeded" — which, with no error boundary above, blanked the app.
  const selectedClips = useSequenceStore(useShallow(selectSelectedClips));
  const document = useSequenceStore((state) => state.document);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const patchClip = useSequenceStore((state) => state.patchClip);

  if (!document) return null;
  const fps = document.sequence.fps;

  // S160 — a multi-selection gets the batch inspector instead of the blank
  // "select a clip" apology it used to earn.
  if (!clip && selectedClips.length > 1) {
    return <MultiClipInspector clips={selectedClips} fps={fps} />;
  }

  if (!clip) {
    return <SequenceOverviewCard document={document} fps={fps} durationFrames={durationFrames} />;
  }

  return (
    <SingleClipInspector
      key={clip.id}
      clip={clip}
      document={document}
      fps={fps}
      patchClip={patchClip}
    />
  );
}
