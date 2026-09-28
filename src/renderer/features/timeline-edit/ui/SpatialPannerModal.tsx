import React, { useCallback, useMemo, useRef, useState } from 'react';

import {
  ATMOS_714_SPEAKER_COORDS,
  DEFAULT_SPATIAL_AUDIO_CONFIG,
  DEFAULT_TRACK_SPATIAL_SETTINGS,
  SURROUND_51_SPEAKER_COORDS,
  computeAtmos714Pan,
  computeBinauralHrtfCues,
  computeSurround51Pan,
  sphericalToCartesian3D,
  type AtmosSpeakerName,
  type MasterAudioFormat,
  type Surround51SpeakerName,
  type TrackSpatialSettings,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Switch } from '../../../shared/ui/Switch';
import { useAudioMixerStore } from '../model/audioMixerStore';

export interface SpatialPannerModalProps {
  open: boolean;
  onClose: () => void;
  initialTrackId?: string | null;
}

const SPATIAL_PRESETS: {
  label: string;
  azimuthDeg: number;
  elevationDeg: number;
  distanceM: number;
  spreadDeg: number;
  icon: string;
}[] = [
  { label: 'Center Dialogue', azimuthDeg: 0, elevationDeg: 0, distanceM: 1.5, spreadDeg: 20, icon: 'mic' },
  { label: 'Wide Left', azimuthDeg: -45, elevationDeg: 0, distanceM: 2.0, spreadDeg: 35, icon: 'arrow_back' },
  { label: 'Wide Right', azimuthDeg: 45, elevationDeg: 0, distanceM: 2.0, spreadDeg: 35, icon: 'arrow_forward' },
  { label: 'Left Surround', azimuthDeg: -95, elevationDeg: 0, distanceM: 2.5, spreadDeg: 45, icon: 'surround_sound' },
  { label: 'Right Surround', azimuthDeg: 95, elevationDeg: 0, distanceM: 2.5, spreadDeg: 45, icon: 'surround_sound' },
  { label: 'Atmos Overhead', azimuthDeg: 0, elevationDeg: 60, distanceM: 1.5, spreadDeg: 60, icon: 'arrow_upward' },
  { label: 'Ear Whisper', azimuthDeg: -85, elevationDeg: 0, distanceM: 0.35, spreadDeg: 15, icon: 'hearing' },
  { label: 'Rear Ambient', azimuthDeg: 150, elevationDeg: 15, distanceM: 3.5, spreadDeg: 80, icon: 'spatial_audio' },
];

export function SpatialPannerModal({ open, onClose, initialTrackId }: SpatialPannerModalProps) {
  const document = useSequenceStore((state) => state.document);
  const audioTracks = useMemo(
    () => (document?.tracks ?? []).filter((t) => t.kind === 'audio'),
    [document],
  );

  const spatialConfig = useAudioMixerStore((state) => state.spatialConfig);
  const setSpatialConfig = useAudioMixerStore((state) => state.setSpatialConfig);
  const trackSpatial = useAudioMixerStore((state) => state.trackSpatial);
  const setTrackSpatial = useAudioMixerStore((state) => state.setTrackSpatial);
  const activeSpatialTrackId = useAudioMixerStore((state) => state.activeSpatialTrackId);
  const setActiveSpatialTrackId = useAudioMixerStore((state) => state.setActiveSpatialTrackId);

  // Active track selection
  const selectedTrackId = activeSpatialTrackId ?? initialTrackId ?? audioTracks[0]?.id ?? '';
  const selectedTrack = audioTracks.find((t) => t.id === selectedTrackId);

  const currentSettings: TrackSpatialSettings = useMemo(() => {
    if (!selectedTrackId) return DEFAULT_TRACK_SPATIAL_SETTINGS;
    return trackSpatial[selectedTrackId] ?? {
      ...DEFAULT_TRACK_SPATIAL_SETTINGS,
      enabled: spatialConfig.enabled,
    };
  }, [selectedTrackId, trackSpatial, spatialConfig.enabled]);

  const updateSetting = useCallback(
    (patch: Partial<TrackSpatialSettings>) => {
      if (!selectedTrackId) return;
      setTrackSpatial(selectedTrackId, patch);
    },
    [selectedTrackId, setTrackSpatial],
  );

  // Soundstage Radar Coordinate Mapping (Radius = 120px, Max Range = 6.0m)
  const RADAR_SIZE = 280;
  const RADAR_CENTER = RADAR_SIZE / 2;
  const MAX_RADAR_DIST = 6.0; // 6 meters
  const PIXELS_PER_METER = (RADAR_CENTER - 20) / MAX_RADAR_DIST;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert (azimuthDeg, distanceM) -> (x, y) in SVG
  const sourceCartesian = useMemo(() => {
    const theta = (currentSettings.azimuthDeg * Math.PI) / 180;
    const r = Math.min(MAX_RADAR_DIST, currentSettings.distanceM) * PIXELS_PER_METER;
    // In soundstage coords: 0 deg is UP (front: -Y in SVG), 90 deg is RIGHT (+X in SVG)
    const x = RADAR_CENTER + r * Math.sin(theta);
    const y = RADAR_CENTER - r * Math.cos(theta);
    return { x, y };
  }, [currentSettings.azimuthDeg, currentSettings.distanceM, PIXELS_PER_METER, RADAR_CENTER]);

  // Handle Radar Pointer Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging && e.type !== 'pointerdown') return;
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const dx = clientX - RADAR_CENTER;
    const dy = clientY - RADAR_CENTER;

    // Angle theta: 0 is UP, positive is clockwise (+X), negative is counter-clockwise (-X)
    let thetaRad = Math.atan2(dx, -dy);
    let azimuth = Math.round((thetaRad * 180) / Math.PI);
    if (azimuth > 180) azimuth -= 360;
    if (azimuth < -180) azimuth += 360;

    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    let distM = Math.max(0.3, Math.min(MAX_RADAR_DIST, pixelDist / PIXELS_PER_METER));
    distM = Math.round(distM * 10) / 10;

    updateSetting({ azimuthDeg: azimuth, distanceM: distM, enabled: true });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // 3D Cartesian coordinates for acoustic DSP evaluation
  const source3D = useMemo(() => {
    return sphericalToCartesian3D(
      currentSettings.azimuthDeg,
      currentSettings.elevationDeg,
      currentSettings.distanceM,
      spatialConfig.listenerPos,
    );
  }, [
    currentSettings.azimuthDeg,
    currentSettings.elevationDeg,
    currentSettings.distanceM,
    spatialConfig.listenerPos,
  ]);

  // Real-time acoustic cues
  const binauralCues = useMemo(() => {
    return computeBinauralHrtfCues(source3D, spatialConfig);
  }, [source3D, spatialConfig]);

  // Multichannel power distribution
  const atmosGains = useMemo(() => {
    return computeAtmos714Pan(source3D, spatialConfig, currentSettings.spreadDeg);
  }, [source3D, spatialConfig, currentSettings.spreadDeg]);

  const surroundGains = useMemo(() => {
    return computeSurround51Pan(source3D, spatialConfig, currentSettings.spreadDeg);
  }, [source3D, spatialConfig, currentSettings.spreadDeg]);

  return (
    <Modal open={open} onClose={onClose} title="Studio Spatial 3D Audio & Binaural Soundstage Panner" size="xl">
      <div className="flex flex-col gap-4 text-text-primary select-none">
        {/* Top Control Bar: Master Format & Global Enable */}
        <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg-app p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-accent-ai text-xl">spatial_audio</span>
              <div>
                <span className="text-xs font-bold text-text-primary block">
                  3D Spatial Audio Processing
                </span>
                <span className="text-[11px] text-text-secondary block">
                  Woodworth-Schlosser HRTF Binaural Cues, ITD/ILD, & Dolby Atmos 7.1.4 Matrix
                </span>
              </div>
            </div>
            <Switch
              checked={spatialConfig.enabled}
              label="Enable spatial audio engine"
              onChange={() => setSpatialConfig({ enabled: !spatialConfig.enabled })}
            />
          </div>

          {/* Master Delivery Format Selector */}
          <div className="flex items-center gap-1.5 bg-bg-canvas px-2.5 py-1 rounded-lg border border-hairline">
            <span className="text-[10px] uppercase font-bold text-text-disabled">Format:</span>
            {(['StereoBinaural', 'Surround51', 'Atmos714', 'ADM_BWF'] as MasterAudioFormat[]).map((fmt) => {
              const active = spatialConfig.masterFormat === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setSpatialConfig({ masterFormat: fmt })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                    active
                      ? 'bg-accent-ai text-black shadow-xs font-black'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {fmt === 'StereoBinaural'
                    ? 'Binaural 3D'
                    : fmt === 'Surround51'
                      ? '5.1 Surround'
                      : fmt === 'Atmos714'
                        ? '7.1.4 Atmos'
                        : 'ADM BWF'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Track Selector Bar */}
        <div className="flex items-center justify-between border-b border-hairline/80 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
              Selected Track:
            </span>
            <select
              value={selectedTrackId}
              onChange={(e) => setActiveSpatialTrackId(e.target.value)}
              className="rounded bg-bg-app border border-hairline px-2.5 py-1 text-xs font-bold text-text-primary focus:outline-none focus:border-accent-ai"
            >
              {audioTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({trackSpatial[t.id]?.enabled ? '3D Active' : 'Stereo'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <Switch
                checked={currentSettings.enabled}
                label="Track spatial processing"
                onChange={() => updateSetting({ enabled: !currentSettings.enabled })}
              />
              <span className="font-semibold text-text-primary">
                {currentSettings.enabled ? 'Spatial Panning Engaged' : 'Stereo Panning'}
              </span>
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateSetting(DEFAULT_TRACK_SPATIAL_SETTINGS)}
              className="text-[10px] py-0.5 h-6"
            >
              Reset Center
            </Button>
          </div>
        </div>

        {/* Main Stage Grid: Radar Soundstage (Left) + 3D Parameter Controls (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left Column: 360° Circular Soundstage Radar (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center rounded-2xl border border-hairline bg-black/60 p-3 relative overflow-hidden">
            <div className="w-full flex items-center justify-between text-[10px] font-mono text-text-disabled pb-1">
              <span>SOUNDSTAGE RADAR (TOP-DOWN)</span>
              <span>SCALE: 0.5M .. 6.0M</span>
            </div>

            <svg
              ref={svgRef}
              width={RADAR_SIZE}
              height={RADAR_SIZE}
              viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
              className="cursor-crosshair touch-none select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <defs>
                <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
                  <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
                </radialGradient>
                <linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Background circular field */}
              <circle cx={RADAR_CENTER} cy={RADAR_CENTER} r={RADAR_CENTER - 10} fill="url(#radarGlow)" />

              {/* Concentric Distance Rings */}
              {[1.0, 2.0, 3.5, 5.0].map((dist) => {
                const r = dist * PIXELS_PER_METER;
                return (
                  <g key={dist}>
                    <circle
                      cx={RADAR_CENTER}
                      cy={RADAR_CENTER}
                      r={r}
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={RADAR_CENTER + 4}
                      y={RADAR_CENTER - r + 9}
                      fill="rgba(255,255,255,0.25)"
                      fontSize="7.5"
                      fontFamily="monospace"
                    >
                      {dist.toFixed(1)}m
                    </text>
                  </g>
                );
              })}

              {/* Radial Degree Axes */}
              <line x1={RADAR_CENTER} y1={10} x2={RADAR_CENTER} y2={RADAR_SIZE - 10} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <line x1={10} y1={RADAR_CENTER} x2={RADAR_SIZE - 10} y2={RADAR_CENTER} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <line
                x1={RADAR_CENTER - 85}
                y1={RADAR_CENTER - 85}
                x2={RADAR_CENTER + 85}
                y2={RADAR_CENTER + 85}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                strokeDasharray="1 3"
              />
              <line
                x1={RADAR_CENTER - 85}
                y1={RADAR_CENTER + 85}
                x2={RADAR_CENTER + 85}
                y2={RADAR_CENTER - 85}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                strokeDasharray="1 3"
              />

              {/* Angle Direction Labels */}
              <text x={RADAR_CENTER} y={18} fill="#22d3ee" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                0° FRONT
              </text>
              <text x={RADAR_SIZE - 12} y={RADAR_CENTER + 3} fill="#94a3b8" fontSize="7.5" fontFamily="monospace" textAnchor="end">
                +90° R
              </text>
              <text x={12} y={RADAR_CENTER + 3} fill="#94a3b8" fontSize="7.5" fontFamily="monospace" textAnchor="start">
                -90° L
              </text>
              <text x={RADAR_CENTER} y={RADAR_SIZE - 14} fill="#94a3b8" fontSize="7.5" fontFamily="monospace" textAnchor="middle">
                180° REAR
              </text>

              {/* Speaker Bed Layout Glyphs */}
              {spatialConfig.masterFormat === 'Atmos714' &&
                Object.entries(ATMOS_714_SPEAKER_COORDS).map(([name, [az, el]]) => {
                  if (name === 'LFE') return null;
                  const rad = (az * Math.PI) / 180;
                  const spkR = RADAR_CENTER - 16;
                  const sx = RADAR_CENTER + spkR * Math.sin(rad);
                  const sy = RADAR_CENTER - spkR * Math.cos(rad);
                  const isHeight = el > 20;
                  return (
                    <g key={name}>
                      <circle
                        cx={sx}
                        cy={sy}
                        r={isHeight ? 4.5 : 3.5}
                        fill={isHeight ? '#0284c7' : '#334155'}
                        stroke={isHeight ? '#38bdf8' : '#64748b'}
                        strokeWidth="1"
                      />
                      <text
                        x={sx}
                        y={sy + 2.5}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="6"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {name}
                      </text>
                    </g>
                  );
                })}

              {spatialConfig.masterFormat === 'Surround51' &&
                Object.entries(SURROUND_51_SPEAKER_COORDS).map(([name, [az]]) => {
                  if (name === 'LFE') return null;
                  const rad = (az * Math.PI) / 180;
                  const spkR = RADAR_CENTER - 16;
                  const sx = RADAR_CENTER + spkR * Math.sin(rad);
                  const sy = RADAR_CENTER - spkR * Math.cos(rad);
                  return (
                    <g key={name}>
                      <circle cx={sx} cy={sy} r="4" fill="#334155" stroke="#38bdf8" strokeWidth="1" />
                      <text x={sx} y={sy + 2.5} textAnchor="middle" fill="#ffffff" fontSize="6.5" fontWeight="bold" fontFamily="monospace">
                        {name}
                      </text>
                    </g>
                  );
                })}

              {/* Center Listener Head Icon */}
              <circle cx={RADAR_CENTER} cy={RADAR_CENTER} r="14" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
              {/* Nose directional point pointing UP (0°) */}
              <polygon
                points={`${RADAR_CENTER - 4},${RADAR_CENTER - 12} ${RADAR_CENTER + 4},${RADAR_CENTER - 12} ${RADAR_CENTER},${RADAR_CENTER - 19}`}
                fill="#38bdf8"
              />
              {/* Ears */}
              <rect x={RADAR_CENTER - 16} y={RADAR_CENTER - 3} width="2.5" height="6" rx="1" fill="#60a5fa" />
              <rect x={RADAR_CENTER + 13.5} y={RADAR_CENTER - 3} width="2.5" height="6" rx="1" fill="#60a5fa" />
              <text x={RADAR_CENTER} y={RADAR_CENTER + 3} textAnchor="middle" fill="#e2e8f0" fontSize="7.5" fontWeight="bold">
                EAR
              </text>

              {/* Ghost source positions for OTHER audio tracks */}
              {audioTracks.map((t) => {
                if (t.id === selectedTrackId) return null;
                const sp = trackSpatial[t.id];
                if (!sp || !sp.enabled) return null;
                const rad = (sp.azimuthDeg * Math.PI) / 180;
                const r = Math.min(MAX_RADAR_DIST, sp.distanceM) * PIXELS_PER_METER;
                const gx = RADAR_CENTER + r * Math.sin(rad);
                const gy = RADAR_CENTER - r * Math.cos(rad);
                return (
                  <g key={t.id} className="cursor-pointer" onClick={() => setActiveSpatialTrackId(t.id)}>
                    <circle cx={gx} cy={gy} r="5" fill="#475569" stroke="#94a3b8" strokeWidth="1" opacity="0.75" />
                    <text x={gx} y={gy - 7} textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="monospace">
                      {t.name.slice(0, 4)}
                    </text>
                  </g>
                );
              })}

              {/* Radiation Beam Spread Arc for Active Source */}
              {(() => {
                const spreadRad = ((currentSettings.spreadDeg / 2) * Math.PI) / 180;
                const azRad = (currentSettings.azimuthDeg * Math.PI) / 180;
                const distR = Math.min(MAX_RADAR_DIST, currentSettings.distanceM) * PIXELS_PER_METER;
                const a1 = azRad - spreadRad;
                const a2 = azRad + spreadRad;
                const p1x = RADAR_CENTER + (distR + 18) * Math.sin(a1);
                const p1y = RADAR_CENTER - (distR + 18) * Math.cos(a1);
                const p2x = RADAR_CENTER + (distR + 18) * Math.sin(a2);
                const p2y = RADAR_CENTER - (distR + 18) * Math.cos(a2);
                return (
                  <path
                    d={`M ${sourceCartesian.x} ${sourceCartesian.y} L ${p1x} ${p1y} A ${distR + 18} ${distR + 18} 0 0 1 ${p2x} ${p2y} Z`}
                    fill="url(#beamGrad)"
                    pointerEvents="none"
                  />
                );
              })()}

              {/* Connecting Vector Line from Listener to Active Source */}
              <line
                x1={RADAR_CENTER}
                y1={RADAR_CENTER}
                x2={sourceCartesian.x}
                y2={sourceCartesian.y}
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />

              {/* ACTIVE SOURCE DRAGGABLE PUCK */}
              <g className="cursor-grab active:cursor-grabbing">
                <circle cx={sourceCartesian.x} cy={sourceCartesian.y} r="15" fill="#06b6d4" fillOpacity="0.2" className="animate-ping" />
                <circle cx={sourceCartesian.x} cy={sourceCartesian.y} r="8.5" fill="#0891b2" stroke="#ffffff" strokeWidth="2" shadow-md="true" />
                <circle cx={sourceCartesian.x} cy={sourceCartesian.y} r="3" fill="#ffffff" />

                {/* Elevation indicator badge on puck */}
                {Math.abs(currentSettings.elevationDeg) > 5 && (
                  <text
                    x={sourceCartesian.x}
                    y={sourceCartesian.y + 16}
                    textAnchor="middle"
                    fill="#38bdf8"
                    fontSize="7"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {currentSettings.elevationDeg > 0 ? `▲+${currentSettings.elevationDeg}°` : `▼${currentSettings.elevationDeg}°`}
                  </text>
                )}
              </g>
            </svg>

            {/* Coordinates Readout Chip */}
            <div className="flex items-center gap-2 mt-1 px-2.5 py-1 rounded-full bg-bg-app border border-hairline text-[10px] font-mono text-cyan-300">
              <span>Azimuth: {currentSettings.azimuthDeg > 0 ? `+${currentSettings.azimuthDeg}°` : `${currentSettings.azimuthDeg}°`}</span>
              <span className="text-text-disabled">|</span>
              <span>Dist: {currentSettings.distanceM.toFixed(1)}m</span>
              <span className="text-text-disabled">|</span>
              <span>Elev: {currentSettings.elevationDeg > 0 ? `+${currentSettings.elevationDeg}°` : `${currentSettings.elevationDeg}°`}</span>
            </div>
          </div>

          {/* Right Column: 3D Soundstage Controls, Presets & Acoustic Cues (7 cols) */}
          <div className="md:col-span-7 flex flex-col gap-3">
            {/* 3D Parameters Sliders */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-hairline bg-bg-app p-3">
              {/* Azimuth Angle */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">Azimuth (Horizontal)</span>
                  <span className="font-mono font-bold text-accent-ai">
                    {currentSettings.azimuthDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={currentSettings.azimuthDeg}
                  aria-label="Azimuth angle"
                  className="w-full accent-cyan-400 cursor-pointer h-1.5"
                  onChange={(e) => updateSetting({ azimuthDeg: Number(e.target.value), enabled: true })}
                />
                <div className="flex justify-between text-[9px] font-mono text-text-disabled">
                  <span>-180° Rear</span>
                  <span>-90° L</span>
                  <span>0° C</span>
                  <span>+90° R</span>
                  <span>+180°</span>
                </div>
              </div>

              {/* Elevation Altitude */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">Elevation (Altitude)</span>
                  <span className={`font-mono font-bold ${currentSettings.elevationDeg > 20 ? 'text-cyan-300' : 'text-text-primary'}`}>
                    {currentSettings.elevationDeg > 0 ? `+${currentSettings.elevationDeg}°` : `${currentSettings.elevationDeg}°`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={1}
                  value={currentSettings.elevationDeg}
                  aria-label="Elevation angle"
                  className="w-full accent-cyan-400 cursor-pointer h-1.5"
                  onChange={(e) => updateSetting({ elevationDeg: Number(e.target.value), enabled: true })}
                />
                <div className="flex justify-between text-[9px] font-mono text-text-disabled">
                  <span>-90° Floor</span>
                  <span>0° Ear-Level</span>
                  <span>+90° Zenith</span>
                </div>
              </div>

              {/* Distance Range */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">Distance (Falloff)</span>
                  <span className="font-mono font-bold text-accent-ai">
                    {currentSettings.distanceM.toFixed(1)} m
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={8.0}
                  step={0.1}
                  value={currentSettings.distanceM}
                  aria-label="Distance falloff"
                  className="w-full accent-cyan-400 cursor-pointer h-1.5"
                  onChange={(e) => updateSetting({ distanceM: Number(e.target.value), enabled: true })}
                />
                <div className="flex justify-between text-[9px] font-mono text-text-disabled">
                  <span>0.3m Intimate</span>
                  <span>2.0m Studio</span>
                  <span>8.0m Far</span>
                </div>
              </div>

              {/* Sound Beam Spread */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">Source Spread (Width)</span>
                  <span className="font-mono font-bold text-accent-ai">
                    {currentSettings.spreadDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={180}
                  step={5}
                  value={currentSettings.spreadDeg}
                  aria-label="Source spread angle"
                  className="w-full accent-cyan-400 cursor-pointer h-1.5"
                  onChange={(e) => updateSetting({ spreadDeg: Number(e.target.value), enabled: true })}
                />
                <div className="flex justify-between text-[9px] font-mono text-text-disabled">
                  <span>0° Point Pin</span>
                  <span>45° Voice</span>
                  <span>180° Diffuse</span>
                </div>
              </div>
            </div>

            {/* Quick Placement Presets */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
                Soundstage Presets
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {SPATIAL_PRESETS.map((p) => {
                  const active =
                    Math.abs(currentSettings.azimuthDeg - p.azimuthDeg) < 3 &&
                    Math.abs(currentSettings.elevationDeg - p.elevationDeg) < 3;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        updateSetting({
                          azimuthDeg: p.azimuthDeg,
                          elevationDeg: p.elevationDeg,
                          distanceM: p.distanceM,
                          spreadDeg: p.spreadDeg,
                          enabled: true,
                        })
                      }
                      className={`flex flex-col items-center justify-center p-1.5 rounded-lg border text-center transition-all ${
                        active
                          ? 'border-accent-ai bg-accent-ai/15 text-accent-ai font-bold shadow-xs'
                          : 'border-hairline bg-bg-app text-text-secondary hover:border-text-disabled hover:text-text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">{p.icon}</span>
                      <span className="text-[10.5px] mt-0.5 leading-tight">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real-Time Acoustic Cues HUD */}
            <div className="rounded-xl border border-hairline/70 bg-bg-canvas p-2.5">
              <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block mb-1.5">
                Binaural Acoustic Cues (HRTF Model)
              </span>
              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                <div className="rounded bg-bg-app p-1 border border-hairline/60">
                  <span className="text-[9px] text-text-disabled block">ITD Delay</span>
                  <span className="text-xs font-bold text-cyan-300">
                    {Math.abs(binauralCues.itdMs).toFixed(2)} ms
                  </span>
                </div>
                <div className="rounded bg-bg-app p-1 border border-hairline/60">
                  <span className="text-[9px] text-text-disabled block">ILD Level</span>
                  <span className="text-xs font-bold text-amber-300">
                    {binauralCues.ildDb > 0 ? `+${binauralCues.ildDb.toFixed(1)}dB` : `${binauralCues.ildDb.toFixed(1)}dB`}
                  </span>
                </div>
                <div className="rounded bg-bg-app p-1 border border-hairline/60">
                  <span className="text-[9px] text-text-disabled block">Pinna Notch</span>
                  <span className="text-xs font-bold text-emerald-300">
                    {Math.round(binauralCues.pinnaNotchHz)} Hz
                  </span>
                </div>
                <div className="rounded bg-bg-app p-1 border border-hairline/60">
                  <span className="text-[9px] text-text-disabled block">Atten Gain</span>
                  <span className="text-xs font-bold text-text-primary">
                    {(binauralCues.distanceGain * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Multichannel Bed Energy Distribution Meters */}
            <div className="rounded-xl border border-hairline/70 bg-bg-canvas p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
                  Speaker Bed Power Matrix ({spatialConfig.masterFormat})
                </span>
                <span className="text-[9px] font-mono text-cyan-400">
                  Energy Normalized ∑w²=1.0
                </span>
              </div>

              {spatialConfig.masterFormat === 'Atmos714' ? (
                <div className="grid grid-cols-6 gap-1 font-mono text-[9px]">
                  {(['L', 'R', 'C', 'LFE', 'Ls', 'Rs', 'Lb', 'Rb', 'Tfl', 'Tfr', 'Tbl', 'Tbr'] as AtmosSpeakerName[]).map(
                    (spk) => {
                      const gain = atmosGains[spk] ?? 0;
                      const pct = Math.min(100, Math.round(gain * 100));
                      const isHeight = spk.startsWith('T');
                      return (
                        <div key={spk} className="flex flex-col items-center gap-0.5 rounded bg-bg-app p-1 border border-hairline/40">
                          <span className={`text-[8.5px] font-bold ${isHeight ? 'text-sky-400' : 'text-text-secondary'}`}>
                            {spk}
                          </span>
                          <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden">
                            <div
                              className={`h-full transition-all ${isHeight ? 'bg-sky-400' : 'bg-emerald-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[8px] text-text-disabled">{pct}%</span>
                        </div>
                      );
                    },
                  )}
                </div>
              ) : spatialConfig.masterFormat === 'Surround51' ? (
                <div className="grid grid-cols-6 gap-1 font-mono text-[9px]">
                  {(['L', 'R', 'C', 'LFE', 'Ls', 'Rs'] as Surround51SpeakerName[]).map((spk) => {
                    const gain = surroundGains[spk] ?? 0;
                    const pct = Math.min(100, Math.round(gain * 100));
                    return (
                      <div key={spk} className="flex flex-col items-center gap-0.5 rounded bg-bg-app p-1 border border-hairline/40">
                        <span className="text-[8.5px] font-bold text-text-secondary">{spk}</span>
                        <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden">
                          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[8px] text-text-disabled">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 font-mono text-[9px]">
                  <div className="flex flex-col gap-0.5 rounded bg-bg-app p-1.5 border border-hairline/40">
                    <div className="flex justify-between">
                      <span className="font-bold text-cyan-300">Left Ear (c0)</span>
                      <span>{(binauralCues.gainLeft * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden">
                      <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, binauralCues.gainLeft * 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded bg-bg-app p-1.5 border border-hairline/40">
                    <div className="flex justify-between">
                      <span className="font-bold text-cyan-300">Right Ear (c1)</span>
                      <span>{(binauralCues.gainRight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden">
                      <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, binauralCues.gainRight * 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <span className="text-xs text-text-disabled">
            {selectedTrack ? `${selectedTrack.name} spatialized at [${source3D[0]}m, ${source3D[1]}m, ${source3D[2]}m]` : 'No track selected'}
          </span>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
