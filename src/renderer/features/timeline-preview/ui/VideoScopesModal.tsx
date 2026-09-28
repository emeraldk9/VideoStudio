import { useEffect, useMemo, useRef } from 'react';

import {
  computeBroadcastGamutAudit,
  computeHistogramBins,
  computeLumaWaveform,
  computeRgbParade,
  computeVectorscopePoints,
  computeWhiteBalanceStats,
  computeYrgbParade,
  detectOutlierPixels,
  getVectorscopeTargets,
  calculateSkinToneLineAngle,
  VECTORSCOPE_SMPTE_TARGETS,
  type ParadeDisplayMode,
  type ScopeRefreshRate,
  type VectorscopeTargetMode,
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

  // S181 Customization Controls
  const paradeMode = useVideoScopesStore((s) => s.paradeMode);
  const setParadeMode = useVideoScopesStore((s) => s.setParadeMode);
  const vectorscopeTargetMode = useVideoScopesStore((s) => s.vectorscopeTargetMode);
  const setVectorscopeTargetMode = useVideoScopesStore((s) => s.setVectorscopeTargetMode);
  const skinToneAngleOffset = useVideoScopesStore((s) => s.skinToneAngleOffset);
  const setSkinToneAngleOffset = useVideoScopesStore((s) => s.setSkinToneAngleOffset);
  const highlightGamutAlerts = useVideoScopesStore((s) => s.highlightGamutAlerts);
  const setHighlightGamutAlerts = useVideoScopesStore((s) => s.setHighlightGamutAlerts);
  const scopeFps = useVideoScopesStore((s) => s.scopeFps);
  const setScopeFps = useVideoScopesStore((s) => s.setScopeFps);

  const frameBuffer = useVideoScopesStore((s) => s.frameBuffer);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute live Broadcast Gamut Audit
  const gamutAudit = useMemo(() => {
    if (!frameBuffer || frameBuffer.width === 0 || frameBuffer.height === 0) return null;
    return computeBroadcastGamutAudit(frameBuffer.data, frameBuffer.width, frameBuffer.height);
  }, [frameBuffer]);

  // Compute live White Balance Stats
  const whiteBalance = useMemo(() => {
    if (!frameBuffer || frameBuffer.width === 0 || frameBuffer.height === 0) return null;
    return computeWhiteBalanceStats(frameBuffer.data, frameBuffer.width, frameBuffer.height);
  }, [frameBuffer]);

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
      renderWaveform(ctx, width, height, data, fbW, fbH, intensity, showGraticule, highlightGamutAlerts);
    } else if (scopeType === 'parade') {
      renderParade(ctx, width, height, data, fbW, fbH, intensity, showGraticule, paradeMode, highlightGamutAlerts);
    } else if (scopeType === 'vectorscope') {
      renderVectorscope(
        ctx,
        width,
        height,
        data,
        fbW,
        fbH,
        intensity,
        showGraticule,
        showSkinToneLine,
        vectorscopeTargetMode,
        skinToneAngleOffset,
      );
    } else if (scopeType === 'histogram') {
      renderHistogram(ctx, width, height, data, fbW, fbH, intensity, showGraticule);
    } else if (scopeType === 'all') {
      renderAllScopes(
        ctx,
        width,
        height,
        data,
        fbW,
        fbH,
        intensity,
        showGraticule,
        showSkinToneLine,
        paradeMode,
        vectorscopeTargetMode,
        skinToneAngleOffset,
        highlightGamutAlerts,
      );
    }

    ctx.restore();
  }, [
    isOpen,
    scopeType,
    intensity,
    showGraticule,
    showSkinToneLine,
    paradeMode,
    vectorscopeTargetMode,
    skinToneAngleOffset,
    highlightGamutAlerts,
    frameBuffer,
  ]);

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
            Rec.709 {scopeFps}fps
          </span>
        </div>
      }
      subtitle="Real-time exposure, parade, and chromatic vectorscope monitoring"
      size={scopeType === 'all' ? 'xl' : 'lg'}
    >
      <div className="flex flex-col gap-3 select-none">
        {/* Scope Mode Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
            {(
              [
                { id: 'waveform', label: 'Waveform', icon: 'show_chart' },
                { id: 'parade', label: 'Parade', icon: 'view_column' },
                { id: 'vectorscope', label: 'Vectorscope', icon: 'radar' },
                { id: 'histogram', label: 'Histogram', icon: 'bar_chart' },
                { id: 'all', label: '4-Up All', icon: 'dashboard' },
              ] as const
            ).map((mode) => {
              const active = scopeType === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setScopeType(mode.id as VideoScopeType)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-button text-xs font-medium transition-all cursor-pointer ${
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

          {/* Controls: Mode Customization, Graticules & Throttling */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Parade Mode Switcher (Visible on Parade or All) */}
            {(scopeType === 'parade' || scopeType === 'all') && (
              <div className="flex items-center rounded border border-hairline bg-bg-app p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setParadeMode('rgb')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    paradeMode === 'rgb'
                      ? 'bg-accent-ai text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="3-Channel RGB Parade"
                >
                  RGB
                </button>
                <button
                  type="button"
                  onClick={() => setParadeMode('yrgb')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    paradeMode === 'yrgb'
                      ? 'bg-accent-ai text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="4-Channel YRGB (Luma + RGB) Parade"
                >
                  YRGB
                </button>
              </div>
            )}

            {/* Vectorscope Target Mode (Visible on Vectorscope or All) */}
            {(scopeType === 'vectorscope' || scopeType === 'all') && (
              <div className="flex items-center rounded border border-hairline bg-bg-app p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setVectorscopeTargetMode('75pct')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    vectorscopeTargetMode === '75pct'
                      ? 'bg-accent-ai text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="75% SMPTE color targets (Broadcast Standard)"
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => setVectorscopeTargetMode('100pct')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    vectorscopeTargetMode === '100pct'
                      ? 'bg-accent-ai text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="100% SMPTE color targets (Full Gamut)"
                >
                  100%
                </button>
              </div>
            )}

            {/* Skin Tone Angle Micro-offset Slider (Visible when Skin Line enabled) */}
            {showSkinToneLine && (scopeType === 'vectorscope' || scopeType === 'all') && (
              <div className="flex items-center gap-1 text-[11px] text-text-disabled font-mono" title="Fine-tune vectorscope skin-tone angle">
                <span>Angle:</span>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={1}
                  value={skinToneAngleOffset}
                  onChange={(e) => setSkinToneAngleOffset(parseInt(e.target.value, 10))}
                  className="w-14 h-1 accent-amber-400 cursor-pointer"
                />
                <span className="text-[10px] tabular-nums text-amber-400 font-semibold w-7 text-right">
                  {skinToneAngleOffset > 0 ? `+${skinToneAngleOffset}°` : `${skinToneAngleOffset}°`}
                </span>
              </div>
            )}

            {/* Graticule toggle */}
            <button
              type="button"
              onClick={() => setShowGraticule(!showGraticule)}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors cursor-pointer ${
                showGraticule
                  ? 'border-accent-ai/50 bg-accent-ai/10 text-accent-ai'
                  : 'border-hairline text-text-disabled'
              }`}
              title="Toggle IRE / Scale Graticules"
            >
              <span className="material-symbols-outlined text-[14px]">grid_4x4</span>
              <span>Graticule</span>
            </button>

            {/* Skin Tone Line Toggle */}
            {(scopeType === 'vectorscope' || scopeType === 'all') && (
              <button
                type="button"
                onClick={() => setShowSkinToneLine(!showSkinToneLine)}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors cursor-pointer ${
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

            {/* Gamut Outliers Alert Toggle */}
            <button
              type="button"
              onClick={() => setHighlightGamutAlerts(!highlightGamutAlerts)}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors cursor-pointer ${
                highlightGamutAlerts
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-400 font-semibold'
                  : 'border-hairline text-text-disabled hover:text-text-primary'
              }`}
              title="Highlight clipped highlights (>100 IRE) and crushed blacks (<0 IRE) with false-color alert indicators"
            >
              <span className="material-symbols-outlined text-[14px]">warning</span>
              <span>Gamut Alerts</span>
            </button>

            {/* Scope FPS Throttling Selector */}
            <div className="flex items-center rounded border border-hairline bg-bg-app p-0.5 text-xs">
              <span className="px-1 text-[10px] font-mono text-text-muted">FPS:</span>
              {([15, 30, 60] as const).map((fpsVal) => (
                <button
                  key={fpsVal}
                  type="button"
                  onClick={() => setScopeFps(fpsVal)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer ${
                    scopeFps === fpsVal
                      ? 'bg-accent-ai text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title={`Sample scopes at ${fpsVal} frames per second`}
                >
                  {fpsVal}
                </button>
              ))}
            </div>

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
                className="w-16 h-1.5 accent-accent-ai cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Live Broadcast Gamut & White Balance HUD Strip */}
        {gamutAudit && whiteBalance && (
          <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-bg-app border border-hairline font-mono">
            <div className="flex items-center gap-3">
              {/* Gamut Legal Status */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    gamutAudit.isLegal ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
                  }`}
                />
                <span className={gamutAudit.isLegal ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {gamutAudit.isLegal ? 'Rec.709 Legal' : 'Gamut Out-of-Spec'}
                </span>
                {!gamutAudit.isLegal && (
                  <span className="text-text-disabled text-[10px]">
                    (Crushed: {gamutAudit.crushedPercent.toFixed(1)}%, Clipped: {gamutAudit.clippedPercent.toFixed(1)}%)
                  </span>
                )}
              </div>

              <span className="text-hairline">|</span>

              {/* White Balance Tint & Temp Bias */}
              <div className="flex items-center gap-1.5">
                <span className="text-text-disabled">WB:</span>
                <span
                  className={`font-semibold capitalize ${
                    whiteBalance.colorCast === 'neutral'
                      ? 'text-sky-400'
                      : whiteBalance.colorCast === 'warm'
                      ? 'text-amber-400'
                      : whiteBalance.colorCast === 'cool'
                      ? 'text-cyan-400'
                      : whiteBalance.colorCast === 'green'
                      ? 'text-emerald-400'
                      : 'text-fuchsia-400'
                  }`}
                >
                  {whiteBalance.colorCast}
                </span>
                <span className="text-[10px] text-text-disabled">
                  (ΔT: {whiteBalance.tempDelta > 0 ? `+${whiteBalance.tempDelta.toFixed(0)}` : whiteBalance.tempDelta.toFixed(0)}, ΔG: {whiteBalance.tintDelta > 0 ? `+${whiteBalance.tintDelta.toFixed(0)}` : whiteBalance.tintDelta.toFixed(0)})
                </span>
              </div>
            </div>

            {/* Average Luma / IRE */}
            <div className="flex items-center gap-2 text-text-secondary text-[11px]">
              <span>IRE:</span>
              <span className="font-semibold text-text-primary">
                {((gamutAudit.averageLuma / 255) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* High-Performance 60fps Scopes Canvas */}
        <div
          className={`relative w-full ${
            scopeType === 'all' ? 'h-[500px]' : 'h-[360px]'
          } rounded-lg border border-hairline overflow-hidden bg-[#0b0c10] shadow-inner flex items-center justify-center transition-all`}
        >
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
  highlightGamutAlerts = false,
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

  // S181: Gamut Outlier Alert Overlays
  if (highlightGamutAlerts) {
    const outliers = detectOutlierPixels(data, fbW, fbH);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';

    if (outliers.clippedCount > 0) {
      ctx.fillStyle = '#06b6d4';
      ctx.fillText(`▲ CLIPPED (${outliers.clippedPercent}%)`, marginL + 6, marginT + 12);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(marginL, marginT);
      ctx.lineTo(marginL + plotW, marginT);
      ctx.stroke();
    }

    if (outliers.crushedCount > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`▼ CRUSHED (${outliers.crushedPercent}%)`, marginL + 6, marginT + plotH - 6);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(marginL, marginT + plotH);
      ctx.lineTo(marginL + plotW, marginT + plotH);
      ctx.stroke();
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
  paradeMode: ParadeDisplayMode = 'rgb',
  highlightGamutAlerts = false,
) {
  const marginL = 35;
  const marginR = 15;
  const marginT = 15;
  const marginB = 25;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  const isYrgb = paradeMode === 'yrgb';
  const numChannels = isYrgb ? 4 : 3;
  const gap = 10;
  const channelW = Math.floor((plotW - gap * (numChannels - 1)) / numChannels);
  const numBins = 100;

  const yrgbData = isYrgb ? computeYrgbParade(data, fbW, fbH, channelW, numBins) : null;
  const rgbData = !isYrgb ? computeRgbParade(data, fbW, fbH, channelW, numBins) : null;

  const channels = isYrgb
    ? [
        { name: 'LUMA', grid: yrgbData!.yGrid, color: (a: number) => `rgba(226, 232, 240, ${a})`, x: marginL },
        { name: 'RED', grid: yrgbData!.rGrid, color: (a: number) => `rgba(239, 68, 68, ${a})`, x: marginL + channelW + gap },
        { name: 'GREEN', grid: yrgbData!.gGrid, color: (a: number) => `rgba(34, 197, 94, ${a})`, x: marginL + (channelW + gap) * 2 },
        { name: 'BLUE', grid: yrgbData!.bGrid, color: (a: number) => `rgba(59, 130, 246, ${a})`, x: marginL + (channelW + gap) * 3 },
      ]
    : [
        { name: 'RED', grid: rgbData!.rGrid, color: (a: number) => `rgba(239, 68, 68, ${a})`, x: marginL },
        { name: 'GREEN', grid: rgbData!.gGrid, color: (a: number) => `rgba(34, 197, 94, ${a})`, x: marginL + channelW + gap },
        { name: 'BLUE', grid: rgbData!.bGrid, color: (a: number) => `rgba(59, 130, 246, ${a})`, x: marginL + (channelW + gap) * 2 },
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

  // S181: Gamut Outlier Alert Overlays
  if (highlightGamutAlerts) {
    const outliers = detectOutlierPixels(data, fbW, fbH);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';

    if (outliers.clippedCount > 0) {
      ctx.fillStyle = '#06b6d4';
      ctx.fillText(`▲ CLIPPED (${outliers.clippedPercent}%)`, marginL + 6, marginT + 12);
    }
    if (outliers.crushedCount > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`▼ CRUSHED (${outliers.crushedPercent}%)`, marginL + 6, marginT + plotH - 6);
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
  targetMode: VectorscopeTargetMode = '75pct',
  skinToneAngleOffset = 0,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.42;

  const targets = getVectorscopeTargets(targetMode, VECTORSCOPE_SMPTE_TARGETS);
  const skinAngle = calculateSkinToneLineAngle(123, skinToneAngleOffset);

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

    // SMPTE Target Boxes (75% or 100%)
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (const target of targets) {
      const tx = centerX + target.u * radius;
      const ty = centerY - target.v * radius;

      ctx.strokeStyle = target.color;
      ctx.strokeRect(tx - 4, ty - 4, 8, 8);

      ctx.fillStyle = target.color;
      ctx.fillText(target.name, tx, ty - 6);
    }

    // Skin Tone / I-Line with angle micro-adjustment
    if (showSkinToneLine) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(skinAngle.radians) * radius,
        centerY - Math.sin(skinAngle.radians) * radius,
      );
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '8px monospace';
      ctx.fillText(
        `I-Line (${skinAngle.degrees}°)`,
        centerX + Math.cos(skinAngle.radians) * (radius + 14),
        centerY - Math.sin(skinAngle.radians) * (radius + 14),
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

  const bins = computeHistogramBins(data, fbW, fbH);
  if (bins.maxCount === 0) return;

  // Graticules
  if (showGraticule) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';

    const levels = [0, 64, 128, 192, 255];
    for (const lvl of levels) {
      const x = marginL + (lvl / 255) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, marginT);
      ctx.lineTo(x, marginT + plotH);
      ctx.stroke();

      ctx.fillText(`${lvl}`, x, height - 10);
    }
  }

  const barW = plotW / 256;
  const maxSafe = Math.max(1, bins.maxCount * 0.75);

  const channels = [
    { counts: bins.r, color: 'rgba(239, 68, 68, 0.35)' },
    { counts: bins.g, color: 'rgba(34, 197, 94, 0.35)' },
    { counts: bins.b, color: 'rgba(59, 130, 246, 0.35)' },
    { counts: bins.luma, color: 'rgba(255, 255, 255, 0.45)' },
  ];

  for (const ch of channels) {
    ctx.fillStyle = ch.color;
    for (let i = 0; i < 256; i++) {
      const barH = Math.min(plotH, (ch.counts[i] / maxSafe) * plotH * intensity);
      ctx.fillRect(marginL + i * barW, marginT + plotH - barH, Math.max(1, barW), barH);
    }
  }
}

function renderAllScopes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  fbW: number,
  fbH: number,
  intensity: number,
  showGraticule: boolean,
  showSkinToneLine: boolean,
  paradeMode: ParadeDisplayMode = 'rgb',
  vectorscopeTargetMode: VectorscopeTargetMode = '75pct',
  skinToneAngleOffset = 0,
  highlightGamutAlerts = false,
) {
  const halfW = width / 2;
  const halfH = height / 2;

  // 1. Top-Left: Waveform (Luma)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, halfW, halfH);
  ctx.clip();
  renderWaveform(ctx, halfW, halfH, data, fbW, fbH, intensity, showGraticule, highlightGamutAlerts);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WAVEFORM (LUMA)', 10, 14);
  ctx.restore();

  // 2. Top-Right: Parade (RGB or YRGB)
  ctx.save();
  ctx.translate(halfW, 0);
  ctx.beginPath();
  ctx.rect(0, 0, halfW, halfH);
  ctx.clip();
  renderParade(ctx, halfW, halfH, data, fbW, fbH, intensity, showGraticule, paradeMode, highlightGamutAlerts);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(paradeMode === 'yrgb' ? 'YRGB PARADE' : 'RGB PARADE', 10, 14);
  ctx.restore();

  // 3. Bottom-Left: Vectorscope
  ctx.save();
  ctx.translate(0, halfH);
  ctx.beginPath();
  ctx.rect(0, 0, halfW, halfH);
  ctx.clip();
  renderVectorscope(
    ctx,
    halfW,
    halfH,
    data,
    fbW,
    fbH,
    intensity,
    showGraticule,
    showSkinToneLine,
    vectorscopeTargetMode,
    skinToneAngleOffset,
  );
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('VECTORSCOPE', 10, 14);
  ctx.restore();

  // 4. Bottom-Right: Histogram
  ctx.save();
  ctx.translate(halfW, halfH);
  ctx.beginPath();
  ctx.rect(0, 0, halfW, halfH);
  ctx.clip();
  renderHistogram(ctx, halfW, halfH, data, fbW, fbH, intensity, showGraticule);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('HISTOGRAM', 10, 14);
  ctx.restore();

  // Dividing crosshair grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(halfW, 0);
  ctx.lineTo(halfW, height);
  ctx.moveTo(0, halfH);
  ctx.lineTo(width, halfH);
  ctx.stroke();
}
