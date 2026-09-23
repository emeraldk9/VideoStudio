import React, { useEffect, useMemo, useState } from 'react';
import {
  simulateMotionTracking,
  smoothTrajectory,
  bakeTrajectoryToKeyframes,
  attachClipToTrajectory,
  type MotionTrackingTrajectory,
  type SequenceClip,
  type SequenceDocument,
} from '@shared';
import { useSequenceStore } from '../../../../entities/sequence';
import { Button } from '../../../../shared/ui/Button';
import { Section } from '../../../../shared/ui/Section';

export interface MotionTrackingSectionProps {
  clip: SequenceClip;
  document: SequenceDocument;
  fps: number;
}

export const MotionTrackingSection = React.memo(function MotionTrackingSection({
  clip,
  document,
  fps: _fps,
}: MotionTrackingSectionProps) {
  const commitClips = useSequenceStore((state) => state.commitClips);
  const patchClip = useSequenceStore((state) => state.patchClip);

  const [targetX, setTargetX] = useState<number>(0.5);
  const [targetY, setTargetY] = useState<number>(0.5);
  const [pattern, setPattern] = useState<'linear_pan' | 'parabolic_arc' | 'orbital_circle' | 'wandering_subject'>('wandering_subject');
  const [alpha, setAlpha] = useState<number>(0.2);
  const [offsetX, setOffsetX] = useState<number>(0.0);
  const [offsetY, setOffsetY] = useState<number>(-0.15);

  const [trajectory, setTrajectory] = useState<MotionTrackingTrajectory | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Other candidate clips to pin onto this tracked subject
  const otherClips = useMemo(() => {
    return document.clips.filter((c) => c.id !== clip.id);
  }, [document.clips, clip.id]);

  const [pinTargetClipId, setPinTargetClipId] = useState<string>(
    otherClips[0]?.id ?? ''
  );

  useEffect(() => {
    if (!otherClips.some((c) => c.id === pinTargetClipId) && otherClips.length > 0) {
      setPinTargetClipId(otherClips[0]?.id ?? '');
    }
  }, [otherClips, pinTargetClipId]);

  const handleTrack = () => {
    setIsTracking(true);
    setStatusMsg(null);
    try {
      const points = simulateMotionTracking(
        { x: targetX, y: targetY },
        pattern,
        Math.max(2, clip.durationFrames),
      );
      const avgConf = points.reduce((acc, p) => acc + p.confidence, 0) / points.length;
      const traj: MotionTrackingTrajectory = {
        id: `traj-${Date.now()}`,
        name: `Tracking ${clip.label || clip.id.slice(0, 6)}`,
        sourceClipId: clip.id,
        startFrame: 0,
        points,
        smoothed: false,
        averageConfidence: avgConf,
      };
      setTrajectory(traj);
      setStatusMsg(`Tracked ${points.length} frames (${Math.round(avgConf * 100)}% avg confidence)`);
    } finally {
      setIsTracking(false);
    }
  };

  const handleSmooth = () => {
    if (!trajectory) return;
    const smoothedPoints = smoothTrajectory(trajectory.points, alpha);
    const avgConf = smoothedPoints.reduce((acc, p) => acc + p.confidence, 0) / smoothedPoints.length;
    setTrajectory({
      ...trajectory,
      points: smoothedPoints,
      smoothed: true,
      averageConfidence: avgConf,
    });
    setStatusMsg(`Smoothed trajectory with bidirectional EMA (alpha=${alpha.toFixed(2)})`);
  };

  const handlePinOverlyingClip = () => {
    if (!trajectory) return;
    const targetClip = document.clips.find((c) => c.id === pinTargetClipId);
    if (!targetClip) {
      setStatusMsg('Please select a target clip to pin.');
      return;
    }

    const pinnedClip = attachClipToTrajectory(targetClip, trajectory, {
      x: offsetX,
      y: offsetY,
    });

    commitClips([pinnedClip]);
    const label = targetClip.label || targetClip.effects?.text?.text || targetClip.id.slice(0, 8);
    setStatusMsg(`Pinned clip "${label}" to tracked motion trajectory!`);
  };

  const handleBakeToSelf = () => {
    if (!trajectory) return;
    const baked = bakeTrajectoryToKeyframes(trajectory, {
      offset: { x: 0, y: 0 },
      stepFrames: 2,
    });

    const otherKeys = (clip.keyframes ?? []).filter((k) => k.property !== 'x' && k.property !== 'y');
    patchClip(clip.id, { keyframes: [...otherKeys, ...baked] });
    setStatusMsg(`Baked ${baked.length} transform keyframes to current clip.`);
  };

  // Mini SVG path generation for trajectory visualization
  const trajectorySvgPath = useMemo(() => {
    if (!trajectory || trajectory.points.length === 0) return null;
    const w = 240;
    const h = 80;
    return trajectory.points.map((pt, idx) => {
      const px = Math.max(0, Math.min(w, pt.x * w));
      const py = Math.max(0, Math.min(h, pt.y * h));
      return `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(' ');
  }, [trajectory]);

  return (
    <Section title="Motion Tracking & Pin-to-Target">
      <div className="flex flex-col gap-3">
        {/* Feature Target Crosshair Coordinate Pickers */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>Tracking Anchor Point (X, Y)</span>
            <span className="font-mono text-[10px] text-accent-ai">
              {(targetX * 100).toFixed(0)}%, {(targetY * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-[11px] text-text-secondary">
              <span className="w-4 text-text-disabled">X</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={targetX}
                onChange={(e) => setTargetX(Number(e.target.value))}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-text-secondary">
              <span className="w-4 text-text-disabled">Y</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={targetY}
                onChange={(e) => setTargetY(Number(e.target.value))}
                className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Pattern / Algorithm Selector */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>Motion Pattern Model</span>
          </div>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value as any)}
            className="w-full bg-bg-surface border border-hairline rounded px-2 py-1 text-xs text-text-primary"
          >
            <option value="wandering_subject">Organic Subject / Handheld Wandering</option>
            <option value="linear_pan">Horizontal Pan / Lateral Glide</option>
            <option value="parabolic_arc">Parabolic Ballistic Arc</option>
            <option value="orbital_circle">Orbital / Circular Feature Drift</option>
          </select>
        </div>

        {/* Action Button: Track Feature Point */}
        <Button
          variant="primary"
          size="sm"
          className="w-full justify-center h-7 text-xs font-semibold"
          disabled={isTracking}
          onClick={handleTrack}
        >
          <span className="material-symbols-outlined text-[14px] mr-1">center_focus_strong</span>
          {isTracking ? 'Tracking Feature Point…' : 'Track Feature Trajectory'}
        </Button>

        {/* Trajectory visualization & Post-Processing */}
        {trajectory && (
          <div className="flex flex-col gap-2 p-2 rounded border border-cyan-500/30 bg-cyan-950/20">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-cyan-300">Feature Trajectory</span>
              <span className="font-mono text-[10px] text-cyan-400">
                {trajectory.points.length} frames · {Math.round(trajectory.averageConfidence * 100)}% conf
              </span>
            </div>

            {/* Mini SVG Trajectory Preview */}
            <div className="relative w-full h-20 bg-bg-canvas/80 rounded border border-hairline overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 240 80" preserveAspectRatio="none">
                {/* Grid Lines */}
                <line x1="0" y1="40" x2="240" y2="40" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="120" y1="0" x2="120" y2="80" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                {/* Path */}
                {trajectorySvgPath && (
                  <path
                    d={trajectorySvgPath}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {/* Start & End Points */}
                {trajectory.points.length > 0 && (
                  <>
                    <circle
                      cx={trajectory.points[0].x * 240}
                      cy={trajectory.points[0].y * 80}
                      r="3.5"
                      fill="#10b981"
                    />
                    <circle
                      cx={trajectory.points[trajectory.points.length - 1].x * 240}
                      cy={trajectory.points[trajectory.points.length - 1].y * 80}
                      r="3.5"
                      fill="#f43f5e"
                    />
                  </>
                )}
              </svg>
              <span className="absolute bottom-1 left-1.5 text-[9px] font-mono text-emerald-400">Start</span>
              <span className="absolute top-1 right-1.5 text-[9px] font-mono text-rose-400">End</span>
            </div>

            {/* Smoothing Filter */}
            <div className="flex flex-col gap-1 pt-1 border-t border-hairline/40">
              <div className="flex items-center justify-between text-[11px] text-text-secondary">
                <span>Bidirectional EMA Smoothing</span>
                <span className="font-mono text-[10px] text-text-primary">α = {alpha.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.05}
                  max={0.5}
                  step={0.05}
                  value={alpha}
                  onChange={(e) => setAlpha(Number(e.target.value))}
                  className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/10 px-2"
                  onClick={handleSmooth}
                >
                  Smooth
                </Button>
              </div>
            </div>

            {/* Pin Overlying Clip Sub-section */}
            <div className="flex flex-col gap-2 pt-1 border-t border-hairline/40">
              <span className="text-[11px] font-semibold text-text-secondary">Pin Overlying Clip to Subject</span>
              {otherClips.length > 0 ? (
                <>
                  <select
                    value={pinTargetClipId}
                    onChange={(e) => setPinTargetClipId(e.target.value)}
                    className="w-full bg-bg-surface border border-hairline rounded px-2 py-1 text-[11px] text-text-primary"
                  >
                    {otherClips.map((c) => {
                      const t = document.tracks.find((trk) => trk.id === c.trackId);
                      const trackLabel = t ? (t.name || t.id) : c.trackId;
                      const clipLabel = c.label || c.effects?.text?.text || c.sourceKind || c.id.slice(0, 6);
                      return (
                        <option key={c.id} value={c.id}>
                          [{trackLabel}] {clipLabel}
                        </option>
                      );
                    })}
                  </select>

                  {/* Pin Offsets */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-text-secondary">
                    <label className="flex items-center gap-1.5">
                      <span className="w-10 text-text-disabled">Offset X</span>
                      <input
                        type="range"
                        min={-0.5}
                        max={0.5}
                        step={0.02}
                        value={offsetX}
                        onChange={(e) => setOffsetX(Number(e.target.value))}
                        className="flex-1 accent-cyan-400 h-1 cursor-pointer"
                      />
                      <span className="font-mono w-7 text-right">{(offsetX * 100).toFixed(0)}%</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="w-10 text-text-disabled">Offset Y</span>
                      <input
                        type="range"
                        min={-0.5}
                        max={0.5}
                        step={0.02}
                        value={offsetY}
                        onChange={(e) => setOffsetY(Number(e.target.value))}
                        className="flex-1 accent-cyan-400 h-1 cursor-pointer"
                      />
                      <span className="font-mono w-7 text-right">{(offsetY * 100).toFixed(0)}%</span>
                    </label>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center h-6 text-[11px] text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/40"
                    onClick={handlePinOverlyingClip}
                  >
                    <span className="material-symbols-outlined text-[13px] mr-1">push_pin</span>
                    Bake & Pin Overlying Clip
                  </Button>
                </>
              ) : (
                <p className="text-[10px] text-text-disabled italic">
                  No other clips found on timeline. Add a text, sticker, or overlay clip to pin to this tracked feature.
                </p>
              )}

              {/* Bake to self */}
              <button
                type="button"
                onClick={handleBakeToSelf}
                className="text-[10px] text-text-disabled hover:text-cyan-300 text-center underline transition-colors pt-1 cursor-pointer"
              >
                Or bake motion trajectory directly into this clip's position keyframes
              </button>
            </div>
          </div>
        )}

        {statusMsg && (
          <p className="text-[10px] text-cyan-400 font-mono text-center">{statusMsg}</p>
        )}
      </div>
    </Section>
  );
});
