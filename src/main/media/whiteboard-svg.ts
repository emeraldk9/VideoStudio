import {
  WHITEBOARD_TRACE_MAX_PEN_POINTS,
  WHITEBOARD_TRACE_STROKE_FRACTION,
  type WhiteboardPenPoint,
  type WhiteboardTraceSettings,
} from '../../shared';
import type { TraceImageResult } from './whiteboard-trace';

/** Point in 2D space */
interface Point2D {
  x: number;
  y: number;
}

/** Cubic Bézier evaluation */
function evalCubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, steps = 12): Point2D[] {
  const pts: Point2D[] = [];
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const n = Math.max(steps, Math.min(128, Math.floor(chord / 2.5)));
  for (let s = 1; s <= n; s += 1) {
    const t = s / n;
    const mt = 1.0 - t;
    const x = mt ** 3 * p0.x + 3.0 * mt ** 2 * t * p1.x + 3.0 * mt * t ** 2 * p2.x + t ** 3 * p3.x;
    const y = mt ** 3 * p0.y + 3.0 * mt ** 2 * t * p1.y + 3.0 * mt * t ** 2 * p2.y + t ** 3 * p3.y;
    pts.push({ x, y });
  }
  return pts;
}

/** Quadratic Bézier evaluation */
function evalQuadraticBezier(p0: Point2D, p1: Point2D, p2: Point2D, steps = 10): Point2D[] {
  const pts: Point2D[] = [];
  const chord = Math.hypot(p2.x - p0.x, p2.y - p0.y);
  const n = Math.max(steps, Math.min(96, Math.floor(chord / 2.5)));
  for (let s = 1; s <= n; s += 1) {
    const t = s / n;
    const mt = 1.0 - t;
    const x = mt ** 2 * p0.x + 2.0 * mt * t * p1.x + t ** 2 * p2.x;
    const y = mt ** 2 * p0.y + 2.0 * mt * t * p1.y + t ** 2 * p2.y;
    pts.push({ x, y });
  }
  return pts;
}

/** SVG Arc evaluation */
function evalSvgArc(
  x1: number,
  y1: number,
  rxRaw: number,
  ryRaw: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): Point2D[] {
  if (Math.abs(x1 - x2) < 1e-4 && Math.abs(y1 - y2) < 1e-4) return [];
  let rx = Math.abs(rxRaw);
  let ry = Math.abs(ryRaw);
  if (rx === 0 || ry === 0) return [{ x: x2, y: y2 }];

  const phi = ((phiDeg % 360) * Math.PI) / 180.0;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2.0;
  const dy = (y1 - y2) / 2.0;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambdaVal = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2);
  if (lambdaVal > 1.0) {
    const s = Math.sqrt(lambdaVal);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc === sweep ? -1.0 : 1.0;
  const num = Math.max(0.0, rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2);
  const den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2;
  const coef = den > 0 ? sign * Math.sqrt(num / den) : 0.0;
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * -((ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2.0;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2.0;

  const angle = (u: Point2D, v: Point2D): number => {
    const dot = u.x * v.x + u.y * v.y;
    const mag = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
    const c = Math.max(-1.0, Math.min(1.0, dot / (mag || 1.0)));
    let ang = Math.acos(c);
    if (u.x * v.y - u.y * v.x < 0) ang = -ang;
    return ang;
  };

  const v1 = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
  const v2 = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };
  const theta1 = angle({ x: 1.0, y: 0.0 }, v1);
  let dtheta = angle(v1, v2);
  if (!sweep && dtheta > 0) dtheta -= 2.0 * Math.PI;
  else if (sweep && dtheta < 0) dtheta += 2.0 * Math.PI;

  const steps = Math.max(4, Math.min(64, Math.floor(Math.abs(dtheta) / (Math.PI / 16.0))));
  const pts: Point2D[] = [];
  for (let s = 1; s <= steps; s += 1) {
    const t = theta1 + dtheta * (s / steps);
    const px = rx * Math.cos(t);
    const py = ry * Math.sin(t);
    const rxRot = cosPhi * px - sinPhi * py + cx;
    const ryRot = sinPhi * px + cosPhi * py + cy;
    pts.push({ x: rxRot, y: ryRot });
  }
  return pts;
}

/**
 * Pure TypeScript SVG Vector Stroke Extractor
 */
export function parseSvgToVectorStrokes(
  svgXml: string,
  targetWidth: number,
  targetHeight: number,
): Array<Point2D[]> {
  // 1. ViewBox and dimensions
  let vbW = targetWidth;
  let vbH = targetHeight;
  const vbMatch = svgXml.match(/viewBox=["']([0-9.,\s-]+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      vbW = parts[2];
      vbH = parts[3];
    }
  } else {
    const wMatch = svgXml.match(/width=["']([0-9.]+)["']/i);
    const hMatch = svgXml.match(/height=["']([0-9.]+)["']/i);
    if (wMatch) vbW = parseFloat(wMatch[1]) || targetWidth;
    if (hMatch) vbH = parseFloat(hMatch[1]) || targetHeight;
  }

  const scaleX = targetWidth / Math.max(1.0, vbW);
  const scaleY = targetHeight / Math.max(1.0, vbH);

  const strokes: Array<Point2D[]> = [];

  // 2. Extract path elements
  const pathRegex = /<path\b[^>]*\bd=["']([^"']+)["'][^>]*>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pathRegex.exec(svgXml)) !== null) {
    const d = pMatch[1];
    const cmdRegex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let stroke: Point2D[] = [];
    let curX = 0.0;
    let curY = 0.0;
    let startX = 0.0;
    let startY = 0.0;
    let lastCtrlX = 0.0;
    let lastCtrlY = 0.0;
    let lastCmd = '';

    let cMatch: RegExpExecArray | null;
    while ((cMatch = cmdRegex.exec(d)) !== null) {
      const cmd = cMatch[1];
      const args = cMatch[2];
      const numMatches = args.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
      const nums = numMatches ? numMatches.map(Number) : [];
      const nLen = nums.length;

      if (cmd === 'M' || cmd === 'm') {
        if (stroke.length > 1) strokes.push(stroke);
        stroke = [];
        if (nLen >= 2) {
          curX = cmd === 'M' ? nums[0] : curX + nums[0];
          curY = cmd === 'M' ? nums[1] : curY + nums[1];
          startX = curX;
          startY = curY;
          stroke.push({ x: curX * scaleX, y: curY * scaleY });
          for (let i = 2; i < nLen - 1; i += 2) {
            curX = cmd === 'M' ? nums[i] : curX + nums[i];
            curY = cmd === 'M' ? nums[i + 1] : curY + nums[i + 1];
            stroke.push({ x: curX * scaleX, y: curY * scaleY });
          }
        }
      } else if (cmd === 'L' || cmd === 'l') {
        for (let i = 0; i < nLen - 1; i += 2) {
          const nx = cmd === 'L' ? nums[i] : curX + nums[i];
          const ny = cmd === 'L' ? nums[i + 1] : curY + nums[i + 1];
          const dist = Math.hypot(nx - curX, ny - curY);
          const steps = Math.max(2, Math.floor(dist / 3.0));
          for (let s = 1; s <= steps; s += 1) {
            const px = curX + (nx - curX) * (s / steps);
            const py = curY + (ny - curY) * (s / steps);
            stroke.push({ x: px * scaleX, y: py * scaleY });
          }
          curX = nx;
          curY = ny;
        }
      } else if (cmd === 'H' || cmd === 'h') {
        for (let i = 0; i < nLen; i += 1) {
          const nx = cmd === 'H' ? nums[i] : curX + nums[i];
          const dist = Math.abs(nx - curX);
          const steps = Math.max(2, Math.floor(dist / 3.0));
          for (let s = 1; s <= steps; s += 1) {
            const px = curX + (nx - curX) * (s / steps);
            stroke.push({ x: px * scaleX, y: curY * scaleY });
          }
          curX = nx;
        }
      } else if (cmd === 'V' || cmd === 'v') {
        for (let i = 0; i < nLen; i += 1) {
          const ny = cmd === 'V' ? nums[i] : curY + nums[i];
          const dist = Math.abs(ny - curY);
          const steps = Math.max(2, Math.floor(dist / 3.0));
          for (let s = 1; s <= steps; s += 1) {
            const py = curY + (ny - curY) * (s / steps);
            stroke.push({ x: curX * scaleX, y: py * scaleY });
          }
          curY = ny;
        }
      } else if (cmd === 'C' || cmd === 'c') {
        for (let i = 0; i < nLen - 5; i += 6) {
          const cp1 = cmd === 'C' ? { x: nums[i], y: nums[i + 1] } : { x: curX + nums[i], y: curY + nums[i + 1] };
          const cp2 = cmd === 'C' ? { x: nums[i + 2], y: nums[i + 3] } : { x: curX + nums[i + 2], y: curY + nums[i + 3] };
          const endPt = cmd === 'C' ? { x: nums[i + 4], y: nums[i + 5] } : { x: curX + nums[i + 4], y: curY + nums[i + 5] };
          const bPts = evalCubicBezier({ x: curX, y: curY }, cp1, cp2, endPt);
          for (const pt of bPts) {
            stroke.push({ x: pt.x * scaleX, y: pt.y * scaleY });
          }
          lastCtrlX = cp2.x;
          lastCtrlY = cp2.y;
          curX = endPt.x;
          curY = endPt.y;
        }
      } else if (cmd === 'S' || cmd === 's') {
        for (let i = 0; i < nLen - 3; i += 4) {
          const cp1 = ['C', 'c', 'S', 's'].includes(lastCmd)
            ? { x: 2.0 * curX - lastCtrlX, y: 2.0 * curY - lastCtrlY }
            : { x: curX, y: curY };
          const cp2 = cmd === 'S' ? { x: nums[i], y: nums[i + 1] } : { x: curX + nums[i], y: curY + nums[i + 1] };
          const endPt = cmd === 'S' ? { x: nums[i + 2], y: nums[i + 3] } : { x: curX + nums[i + 2], y: curY + nums[i + 3] };
          const bPts = evalCubicBezier({ x: curX, y: curY }, cp1, cp2, endPt);
          for (const pt of bPts) {
            stroke.push({ x: pt.x * scaleX, y: pt.y * scaleY });
          }
          lastCtrlX = cp2.x;
          lastCtrlY = cp2.y;
          curX = endPt.x;
          curY = endPt.y;
        }
      } else if (cmd === 'Q' || cmd === 'q') {
        for (let i = 0; i < nLen - 3; i += 4) {
          const cp = cmd === 'Q' ? { x: nums[i], y: nums[i + 1] } : { x: curX + nums[i], y: curY + nums[i + 1] };
          const endPt = cmd === 'Q' ? { x: nums[i + 2], y: nums[i + 3] } : { x: curX + nums[i + 2], y: curY + nums[i + 3] };
          const qPts = evalQuadraticBezier({ x: curX, y: curY }, cp, endPt);
          for (const pt of qPts) {
            stroke.push({ x: pt.x * scaleX, y: pt.y * scaleY });
          }
          lastCtrlX = cp.x;
          lastCtrlY = cp.y;
          curX = endPt.x;
          curY = endPt.y;
        }
      } else if (cmd === 'A' || cmd === 'a') {
        for (let i = 0; i < nLen - 6; i += 7) {
          const rx = nums[i];
          const ry = nums[i + 1];
          const rot = nums[i + 2];
          const large = Math.round(nums[i + 3]);
          const swp = Math.round(nums[i + 4]);
          const nx = cmd === 'A' ? nums[i + 5] : curX + nums[i + 5];
          const ny = cmd === 'A' ? nums[i + 6] : curY + nums[i + 6];
          const aPts = evalSvgArc(curX, curY, rx, ry, rot, large, swp, nx, ny);
          for (const pt of aPts) {
            stroke.push({ x: pt.x * scaleX, y: pt.y * scaleY });
          }
          curX = nx;
          curY = ny;
        }
      } else if (cmd === 'Z' || cmd === 'z') {
        if (stroke.length > 2) {
          stroke.push({ x: startX * scaleX, y: startY * scaleY });
          strokes.push(stroke);
          stroke = [];
        }
        curX = startX;
        curY = startY;
      }
      lastCmd = cmd;
    }
    if (stroke.length > 1) strokes.push(stroke);
  }

  // 3. Extract polylines and polygons
  const polyRegex = /<(polyline|polygon)\b[^>]*\bpoints=["']([^"']+)["'][^>]*>/gi;
  let polyMatch: RegExpExecArray | null;
  while ((polyMatch = polyRegex.exec(svgXml)) !== null) {
    const isPolygon = polyMatch[1].toLowerCase() === 'polygon';
    const rawCoords = (polyMatch[2].match(/[-+]?\d*\.?\d+/g) || []).map(Number);
    if (rawCoords.length >= 4) {
      const s: Point2D[] = [];
      for (let i = 0; i < rawCoords.length - 1; i += 2) {
        s.push({ x: rawCoords[i] * scaleX, y: rawCoords[i + 1] * scaleY });
      }
      if (isPolygon && s.length > 2) s.push({ ...s[0] });
      if (s.length > 1) strokes.push(s);
    }
  }

  // 4. Extract lines
  const lineRegex = /<line\b[^>]*\bx1=["']([^"']+)["'][^>]*\by1=["']([^"']+)["'][^>]*\bx2=["']([^"']+)["'][^>]*\by2=["']([^"']+)["'][^>]*>/gi;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRegex.exec(svgXml)) !== null) {
    const x1 = parseFloat(lineMatch[1]) * scaleX;
    const y1 = parseFloat(lineMatch[2]) * scaleY;
    const x2 = parseFloat(lineMatch[3]) * scaleX;
    const y2 = parseFloat(lineMatch[4]) * scaleY;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(2, Math.floor(dist / 3.0));
    const s: Point2D[] = [];
    for (let st = 0; st <= steps; st += 1) {
      s.push({ x: x1 + (x2 - x1) * (st / steps), y: y1 + (y2 - y1) * (st / steps) });
    }
    strokes.push(s);
  }

  return strokes;
}

/**
 * Direct Vector SVG Trace Engine:
 * Converts vector strokes directly into `timeMap` (0..254) and `penPath`.
 */
export function traceSvg(
  svgXml: string,
  width: number,
  height: number,
  settings: WhiteboardTraceSettings = { detail: 'medium', order: 'nearest' },
): TraceImageResult {
  const strokes = parseSvgToVectorStrokes(svgXml, width, height);
  const timeMap = new Uint8Array(width * height).fill(255);
  const penPath: WhiteboardPenPoint[] = [];

  if (strokes.length === 0) {
    return { timeMap, width, height, penPath, strokeCount: 0 };
  }

  const strokeFraction = settings.strokeFraction ?? WHITEBOARD_TRACE_STROKE_FRACTION;

  // Measure arc lengths
  const strokeLengths: number[] = [];
  let totalLength = 0;
  for (const s of strokes) {
    let len = 0;
    for (let i = 1; i < s.length; i += 1) {
      len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    }
    strokeLengths.push(len);
    totalLength += len;
  }

  let cumulativeLength = 0;
  for (let si = 0; si < strokes.length; si += 1) {
    const s = strokes[si];
    const sLen = strokeLengths[si];

    for (let pi = 0; pi < s.length; pi += 1) {
      const pt = s[pi];
      const curDist = cumulativeLength + (sLen > 0 ? (sLen * pi) / (s.length - 1) : 0);
      const tNorm = totalLength > 0 ? (curDist / totalLength) * strokeFraction : 0;
      const tVal = Math.min(254, Math.max(0, Math.round(tNorm * 254)));

      // Splat anti-aliased 3x3 footprint onto timeMap
      const px = Math.round(pt.x);
      const py = Math.round(pt.y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            const idx = ny * width + nx;
            if (tVal < timeMap[idx]) timeMap[idx] = tVal;
          }
        }
      }

      // Record pen keyframe at start, end, or interval
      if (pi === 0 || pi === s.length - 1 || pi % 8 === 0) {
        penPath.push({
          t: tNorm,
          x: pt.x / width,
          y: pt.y / height,
        });
      }
    }
    cumulativeLength += sLen;
  }

  // Fill bloom via two-pass chamfer distance
  const INF = 0x3fffffff;
  const distance = new Int32Array(width * height).fill(INF);
  for (let i = 0; i < timeMap.length; i += 1) {
    if (timeMap[i] !== 255) distance[i] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (x > 0) distance[i] = Math.min(distance[i], distance[i - 1] + 3);
      if (y > 0) {
        distance[i] = Math.min(distance[i], distance[i - width] + 3);
        if (x > 0) distance[i] = Math.min(distance[i], distance[i - width - 1] + 4);
        if (x < width - 1) distance[i] = Math.min(distance[i], distance[i - width + 1] + 4);
      }
    }
  }
  let maxDistance = 0;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (x < width - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 3);
      if (y < height - 1) {
        distance[i] = Math.min(distance[i], distance[i + width] + 3);
        if (x < width - 1) distance[i] = Math.min(distance[i], distance[i + width + 1] + 4);
        if (x > 0) distance[i] = Math.min(distance[i], distance[i + width - 1] + 4);
      }
      if (distance[i] < INF && distance[i] > maxDistance) maxDistance = distance[i];
    }
  }
  for (let i = 0; i < timeMap.length; i += 1) {
    if (timeMap[i] === 255) {
      const normalized = maxDistance > 0 ? distance[i] / maxDistance : 0;
      const t = strokeFraction + (1 - strokeFraction) * Math.min(1, normalized);
      timeMap[i] = Math.min(254, Math.round(t * 254));
    }
  }

  // Cap penPath length to WHITEBOARD_TRACE_MAX_PEN_POINTS
  const cappedPen = penPath.length > WHITEBOARD_TRACE_MAX_PEN_POINTS
    ? penPath.filter((_, idx) => idx % Math.ceil(penPath.length / WHITEBOARD_TRACE_MAX_PEN_POINTS) === 0)
    : penPath;

  return {
    timeMap,
    width,
    height,
    penPath: cappedPen,
    strokeCount: strokes.length,
  };
}
