import { useEffect, useRef } from 'react';

import {
  computeHistogramBins,
  computeLumaWaveform,
  computeRgbParade,
  computeVectorscopePoints,
  SKIN_TONE_LINE_ANGLE_RAD,
  VECTORSCOPE_SMPTE_TARGETS,
} from '@shared';

import { Modal } from '../../../shared/ui/Modal';
import {
  useVideoScopesStore,
  type VideoScopeType,
} from '../model/videoScopesStore';

export function VideoScopesModal() {
  const isOpen = useVideoScopesStore((s) => s.isOpen);
  const toggleIsOpen = useVideoScopesStore((s) => s.toggleIsOpen);
  const scopeType = useVideoScopesStore((s) => s.scopeType);
  const setScopeType = useVideoScopesStore((s) => s.setScopeType);
  const intensity = useVideoScopesStore((s) => s.intensity);
  const setIntensity = useVideoScopesStore((s) => s.setIntensity);
  const showGraticule = useVideoScopesStore((s) => s.showGraticule);
  const setShowGraticule = useVideoScopesStore((s) => s.setShowGraticule);
  const showSkinToneLine = useVideoScopesStore((s) => s.showSkinToneLine);
  const setShowSkinToneLine = useVideoScopesStore((s) => s.setShowSkinToneLine);
  const frameBuffer = useVideoScopesStore((s) => s.frameBuffer);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render scope canvas on frame update or settings change
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark background
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, width, height);

    if (!frameBuffer || frameBuffer.width === 0 || frameBuffer.height === 0) {
      // Draw placeholder waiting message
      ctx.fillStyle = '#475569';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for video frame...', width / 2, height / 2);
      ctx.restore();
      return;
    }

    const { data, width: fbW, height: fbH } = frameBuffer;

    if (scopeType === 'waveform') {
      renderWaveform(ctx, width, height, data, fbW, fbH, intensity, showGraticule);
    } else if (scopeType === 'parade') {
      renderParade(ctx, width, height, data, fbW, fbH, intensity, showGraticule);
    } else if (scopeType === 'vectorscope') {
      renderVectorscope(ctx, width, height, data, fbW, fbH, intensity, showGraticule, showSkinToneLine);
    } else if (scopeType === 'histogram') {
      renderHistogram(ctx, width, height, data, fbW, fbH, intensity, showGraticule);
    }

    ctx.restore();
  }, [isOpen, scopeType, intensity, showGraticule, showSkinToneLine, frameBuffer]);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={toggleIsOpen}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">query_stats</span>
          <span>Broadcast Video Scopes</span>
          <span className="text-[10px] font-mono text-text-disabled uppercase px-1.5 py-0.5 rounded bg-bg-app border border-hairline">
            Rec.709 60fps
          </span>
        </div>
      }
      subtitle="Real-time exposure, parade, and chromatic vectorscope monitoring"
      size="lg"
    >
      <div className="flex flex-col gap-3 select-none">
        {/* Scope Mode Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
            {(
              [
                { id: 'waveform', label: 'Waveform', icon: 'show_chart' },
                { id: 'parade', label: 'RGB Parade', icon: 'view_column' },
                { id: 'vectorscope', label: 'Vectorscope', icon: 'radar' },
                { id: 'histogram', label: 'Histogram', icon: 'bar_chart' },
              ] as const
            ).map((mode) => {
              const active = scopeType === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setScopeType(mode.id as VideoScopeType)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-button text-xs font-medium transition-all ${
                    active
                      ? 'bg-bg-selected text-text-primary font-semibold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[15px] ${active ? 'text-accent-ai' : ''}`}>
                    {mode.icon}
                  </span>
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Controls: Intensity & Graticules */}
          <div className="flex items-center gap-3">
            {/* Graticule toggle */}
            <button
              type="button"
              onClick={() => setShowGraticule(!showGraticule)}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors ${
                showGraticule
                  ? 'border-accent-ai/50 bg-accent-ai/10 text-accent-ai'
                  : 'border-hairline text-text-disabled'
              }`}
              title="Toggle IRE / Scale Graticules"
            >
              <span className="material-symbols-outlined text-[14px]">grid_4x4</span>
              <span>Graticule</span>
            </button>

            {/* Skin Tone Line Toggle (Vectorscope only) */}
            {scopeType === 'vectorscope' && (
              <button
                type="button"
                onClick={() => setShowSkinToneLine(!showSkinToneLine)}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors ${
                  showSkinToneLine
                    ? 'border-amber-400/50 bg-amber-400/10 text-amber-400'
                    : 'border-hairline text-text-disabled'
                }`}
                title="Toggle Vectorscope Skin-Tone Line"
              >
                <span className="material-symbols-outlined text-[14px]">line_style</span>
                <span>Skin Line</span>
              </button>
            )}

            {/* Trace Intensity */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-disabled font-mono">Gain</span>
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={intensity}
                onChange={(e) => setIntensity(parseFloat(e.target.value))}
                title="Adjust trace brightness gain"
                className="w-20 h-1.5 accent-accent-ai cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* High-Performance 60fps Scopes Canvas */}
        <div className="relative w-full h-[360px] rounded-lg border border-hairline overflow-hidden bg-[#0b0c10] shadow-inner flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Canvas 2D Rendering Implementations
// ---------------------------------------------------------------------------

function renderWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  fbW: number,
  fbH: number,
  intensity: number,
  showGraticule: boolean,
) {
  const marginL = 35;
  const marginR = 15;
  const marginT = 15;
  const marginB = 25;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  const numCols = Math.min(256, Math.floor(plotW));
  const numBins = 100;
  const waveform = computeLumaWaveform(data, fbW, fbH, numCols, numBins);

  // Graticules (0 to 100 IRE)
  if (showGraticule) {
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';

    const ireMarks = [0, 20, 40, 60, 80, 100];
    for (const ire of ireMarks) {
      const y = marginT + plotH - (ire / 100) * plotH;
      ctx.strokeStyle = ire === 0 || ire === 100 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(marginL, y);
      ctx.lineTo(marginL + plotW, y);
      ctx.stroke();

      ctx.fillStyle = ire === 0 || ire === 100 ? '#e2e8f0' : '#64748b';
      ctx.fillText(`${ire}`, marginL - 6, y + 3);
    }
  }

  // Draw Waveform Points / Columns
  const colW = plotW / numCols;
  const binH = plotH / numBins;

  for (let b = 0; b < numBins; b++) {
    const y = marginT + b * binH;
    for (let c = 0; c < numCols; c++) {
      const density = waveform[b * numCols + c];
      if (density <= 0.01) continue;

      const alpha = Math.min(1.0, density * intensity);
      // Classic green phosphor aesthetic
      ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
      ctx.fillRect(marginL + c * colW, y, Math.max(1, colW), Math.max(1, binH));
    }
  }
}

function renderParade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  fbW: number,
  fbH: number,
  intensity: number,
  showGraticule: boolean,
) {
  const marginL = 35;
  const marginR = 15;
  const marginT = 15;
  const marginB = 25;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  const gap = 12;
  const channelW = Math.floor((plotW - gap * 2) / 3);
  const numBins = 100;
  const parade = computeRgbParade(data, fbW, fbH, channelW, numBins);

  const channels = [
    { name: 'RED', grid: parade.rGrid, color: (a: number) => `rgba(239, 68, 68, ${a})`, x: marginL },
    { name: 'GREEN', grid: parade.gGrid, color: (a: number) => `rgba(34, 197, 94, ${a})`, x: marginL + channelW + gap },
    { name: 'BLUE', grid: parade.bGrid, color: (a: number) => `rgba(59, 130, 246, ${a})`, x: marginL + (channelW + gap) * 2 },
  ];

  // Graticules
  if (showGraticule) {
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';

    for (const ire of [0, 50, 100]) {
      const y = marginT + plotH - (ire / 100) * plotH;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(marginL, y);
      ctx.lineTo(marginL + plotW, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.fillText(`${ire}`, marginL - 6, y + 3);
    }
  }

  const binH = plotH / numBins;

  for (const ch of channels) {
    // Channel Header
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ch.name, ch.x + channelW / 2, height - 8);

    // Channel Traces
    for (let b = 0; b < numBins; b++) {
      const y = marginT + b * binH;
      for (let c = 0; c < channelW; c++) {
        const density = ch.grid[b * channelW + c];
        if (density <= 0.01) continue;

        const alpha = Math.min(1.0, density * intensity);
        ctx.fillStyle = ch.color(alpha);
        ctx.fillRect(ch.x + c, y, 1.2, Math.max(1, binH));
      }
    }
  }
}

function renderVectorscope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  fbW: number,
  fbH: number,
  intensity: number,
  showGraticule: boolean,
  showSkinToneLine: boolean,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.42;

  // Outer circle & reference rings
  if (showGraticule) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';

    // Outer 100% circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 75% SMPTE circle
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.75, 0, Math.PI * 2);
    ctx.stroke();

    // Center Crosshairs
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.stroke();

    // SMPTE 75% Target Boxes
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (const target of VECTORSCOPE_SMPTE_TARGETS) {
      // U is horizontal (X), V is vertical (inverted Y)
      const tx = centerX + target.u * radius;
      const ty = centerY - target.v * radius;

      ctx.strokeStyle = target.color;
      ctx.strokeRect(tx - 4, ty - 4, 8, 8);

      ctx.fillStyle = target.color;
      ctx.fillText(target.name, tx, ty - 6);
    }

    // Skin Tone / I-Line
    if (showSkinToneLine) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(SKIN_TONE_LINE_ANGLE_RAD) * radius,
        centerY - Math.sin(SKIN_TONE_LINE_ANGLE_RAD) * radius,
      );
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '8px monospace';
      ctx.fillText(
        'I-Line',
        centerX + Math.cos(SKIN_TONE_LINE_ANGLE_RAD) * (radius + 14),
        centerY - Math.sin(SKIN_TONE_LINE_ANGLE_RAD) * (radius + 14),
      );
    }
  }

  // Draw Chromatic Vectorscope Points
  const points = computeVectorscopePoints(data, fbW, fbH, 2);
  const numPoints = points.length / 2;

  ctx.fillStyle = `rgba(56, 189, 248, ${Math.min(1.0, 0.35 * intensity)})`;

  for (let i = 0; i < numPoints; i++) {
    const u = points[i * 2];
    const v = points[i * 2 + 1];

    const px = centerX + u * radius;
    const py = centerY - v * radius;

    ctx.fillRect(px, py, 1.5, 1.5);
  }
}

function renderHistogram(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  fbW: number,
  fbH: number,
  intensity: number,
  showGraticule: boolean,
) {
  const marginL = 35;
  const marginR = 15;
  const marginT = 15;
  const marginB = 25;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  const hist = computeHistogramBins(data, fbW, fbH);
  const maxVal = hist.maxCount > 0 ? hist.maxCount : 1;

  // Graticules
  if (showGraticule) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    // 0, 64, 128, 192, 255 marks
    for (const bin of [0, 64, 128, 192, 255]) {
      const x = marginL + (bin / 255) * plotW;
      ctx.moveTo(x, marginT);
      ctx.lineTo(x, marginT + plotH);
    }
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Shadows', marginL + plotW * 0.16, height - 8);
    ctx.fillText('Midtones', marginL + plotW * 0.5, height - 8);
    ctx.fillText('Highlights', marginL + plotW * 0.84, height - 8);
  }

  // Draw Channels
  const channels = [
    { data: hist.luma, color: 'rgba(255, 255, 255, 0.4)' },
    { data: hist.r, color: 'rgba(239, 68, 68, 0.55)' },
    { data: hist.g, color: 'rgba(34, 197, 94, 0.55)' },
    { data: hist.b, color: 'rgba(59, 130, 246, 0.55)' },
  ];

  ctx.lineWidth = 1.2;

  for (const ch of channels) {
    ctx.strokeStyle = ch.color;
    ctx.beginPath();

    for (let i = 0; i < 256; i++) {
      const x = marginL + (i / 255) * plotW;
      const normY = Math.min(1.0, (ch.data[i] / maxVal) * (1.2 * intensity));
      const y = marginT + plotH - normY * plotH;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
}
