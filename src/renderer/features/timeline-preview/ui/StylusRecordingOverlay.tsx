/**
 * Milestone S160 — Real-Time Stylus Capture Canvas Overlay.
 *
 * Captures high-frequency digitizer pointer events (pressure, tilt, twist, coalesced events),
 * triggers real-time audio foley synthesis, renders variable-pressure strokes,
 * and records vector paths for automated Timeline Whiteboard clips.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  calculateStrokeVelocity,
  smoothStrokePoints,
  type RecordedPointerPoint,
  type RecordedStroke,
} from '@shared';

import { currentPlayheadFrame } from '../../../entities/sequence';
import { stylusFoley } from '../lib/stylusFoleySynthesizer';
import { useStylusCaptureStore } from '../model/stylusCaptureStore';
import { StylusRecordingHUD } from './StylusRecordingHUD';

export function StylusRecordingOverlay() {
  const isStylusModeActive = useStylusCaptureStore((state) => state.isStylusModeActive);
  const activeTool = useStylusCaptureStore((state) => state.activeTool);
  const activeColor = useStylusCaptureStore((state) => state.activeColor);
  const activeSize = useStylusCaptureStore((state) => state.activeSize);
  const foleyEnabled = useStylusCaptureStore((state) => state.foleyEnabled);
  const foleyVolume = useStylusCaptureStore((state) => state.foleyVolume);
  const smoothing = useStylusCaptureStore((state) => state.smoothing);
  const recordedStrokes = useStylusCaptureStore((state) => state.recordedStrokes);
  const addStroke = useStylusCaptureStore((state) => state.addStroke);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<RecordedStroke | null>(null);
  const lastPointRef = useRef<RecordedPointerPoint | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Redraw canvas whenever recorded strokes change or during active stroke
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderStroke = (stroke: RecordedStroke) => {
      if (stroke.points.length === 0) return;

      ctx.save();
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        if (stroke.tool === 'marker') {
          ctx.globalAlpha = 0.75;
        } else if (stroke.tool === 'pencil') {
          ctx.globalAlpha = 0.85;
        } else {
          ctx.globalAlpha = 1.0;
        }
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const pts = stroke.points;
      if (pts.length === 1) {
        const p = pts[0];
        const rad = Math.max(1, (stroke.baseSize * (0.4 + p.pressure * 1.2)) / 2);
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, rad, 0, Math.PI * 2);
        ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
        ctx.fill();
        ctx.restore();
        return;
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        const avgPressure = (p1.pressure + p2.pressure) / 2;
        let lineWidth = stroke.baseSize * (0.35 + avgPressure * 1.3);

        if (stroke.tool === 'chalk') {
          // Chalk texture with subtle jitter
          lineWidth *= 1.1;
          ctx.setLineDash([lineWidth * 1.5, lineWidth * 0.4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.lineWidth = Math.max(1, lineWidth);
        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.stroke();
      }

      ctx.restore();
    };

    // Render completed strokes
    for (const stroke of recordedStrokes) {
      renderStroke(stroke);
    }

    // Render active stroke in progress
    if (activeStrokeRef.current) {
      renderStroke(activeStrokeRef.current);
    }
  }, [recordedStrokes]);

  // Adjust canvas resolution to match container bounding box
  useEffect(() => {
    if (!isStylusModeActive) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvas.width = Math.round(width * window.devicePixelRatio);
          canvas.height = Math.round(height * window.devicePixelRatio);
          drawScene();
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [isStylusModeActive, drawScene]);

  useEffect(() => {
    drawScene();
  }, [drawScene]);

  if (!isStylusModeActive) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    const now = performance.now();
    const frame = currentPlayheadFrame();

    const initialPoint: RecordedPointerPoint = {
      x,
      y,
      pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      timestamp: now,
      timeOffsetMs: 0,
      frame,
    };

    lastPointRef.current = initialPoint;

    activeStrokeRef.current = {
      id: crypto.randomUUID(),
      tool: activeTool,
      color: activeColor,
      baseSize: activeSize,
      points: [initialPoint],
      startTimeMs: now,
      endTimeMs: now,
      startFrame: frame,
      endFrame: frame,
    };

    if (foleyEnabled) {
      stylusFoley.handlePointerDown(activeTool, pressure, foleyVolume);
    }

    drawScene();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeStrokeRef.current || !canvasRef.current) return;

    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const now = performance.now();
    const frame = currentPlayheadFrame();

    // Capture coalesced micro-events if supported by digitizer driver
    const nativeEvent = e.nativeEvent;
    const rawEvents =
      typeof nativeEvent.getCoalescedEvents === 'function'
        ? nativeEvent.getCoalescedEvents()
        : [nativeEvent];

    for (const raw of rawEvents) {
      const x = Math.max(0, Math.min(1, (raw.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (raw.clientY - rect.top) / rect.height));
      const pressure = raw.pressure && raw.pressure > 0 ? raw.pressure : 0.5;

      const pt: RecordedPointerPoint = {
        x,
        y,
        pressure,
        tiltX: raw.tiltX,
        tiltY: raw.tiltY,
        twist: raw.twist,
        timestamp: now,
        timeOffsetMs: Math.round(now - activeStrokeRef.current.startTimeMs),
        frame,
      };

      if (lastPointRef.current && foleyEnabled) {
        const vel = calculateStrokeVelocity(lastPointRef.current, pt, canvas.width, canvas.height);
        stylusFoley.handlePointerMove(activeTool, pressure, vel, foleyVolume);
      }

      lastPointRef.current = pt;
      activeStrokeRef.current.points.push(pt);
      activeStrokeRef.current.endTimeMs = now;
      activeStrokeRef.current.endFrame = frame;
    }

    if (!animFrameRef.current) {
      animFrameRef.current = requestAnimationFrame(() => {
        animFrameRef.current = null;
        drawScene();
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if capture already lost
    }

    if (foleyEnabled) {
      stylusFoley.handlePointerUp(activeTool, foleyVolume);
    }

    if (activeStrokeRef.current && activeStrokeRef.current.points.length > 0) {
      const stroke = activeStrokeRef.current;
      if (smoothing !== 'none') {
        stroke.points = smoothStrokePoints(stroke.points, smoothing);
      }
      addStroke(stroke);
    }

    activeStrokeRef.current = null;
    lastPointRef.current = null;
    drawScene();
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 touch-none select-none cursor-crosshair overflow-hidden pointer-events-auto"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="h-full w-full block"
      />
      <StylusRecordingHUD />
    </div>
  );
}
