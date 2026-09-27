/**
 * Whiteboard Drafting Pantograph Mechanical Linkage & Magnetic Arc Pivot Operations.
 *
 * Implements architectural and technical drawing mechanical drafting tools:
 * 1. 4-bar articulated parallelogram scissor pantograph with scaling ratio R in [0.5, 4.0].
 * 2. Magnetic anchor pivot point with polar coordinate circular arc locking and discrete concentric snap rings.
 * 3. Mechanical arm deflection, inertia strain, and needle pivot friction telemetry for procedural foley audio.
 * 4. SVG markup generation for brass/steel linkage bars, knurled rivets, and magnetic anchor disk.
 */

export interface PantographConfig {
  enabled: boolean;
  anchorPoint: [number, number];       // Fixed anchor vertex [x, y] on whiteboard
  scaleRatio: number;                  // R = |AP| / |AT|, range 0.5 to 4.0 (default: 2.0)
  armLengthPrimary: number;            // Nominal primary arm length (default: 320)
  armLengthSecondary: number;          // Nominal secondary cross-arm length (default: 240)
  magneticSnapEnabled: boolean;         // Enable polar arc magnetic attraction (default: true)
  magneticSnapRadius: number;          // Snap distance threshold in px (default: 20)
  arcLockRadius: number;               // If > 0, locks strictly to this arc radius (default: 0)
  arcSnapStep: number;                 // Concentric guide ring step in px (default: 50)
  elasticFlexDamping: number;          // Linkage inertia deflection damping (default: 0.05)
  needleFrictionFactor: number;        // Friction coefficient for pivot needle audio (default: 0.75)
  renderOverlayEnabled: boolean;       // Render linkage bars and joints overlay (default: true)
}

export type PantographSettings = Partial<PantographConfig>;

export const DEFAULT_PANTOGRAPH_CONFIG: PantographConfig = {
  enabled: false,
  anchorPoint: [120, 120],
  scaleRatio: 2.0,
  armLengthPrimary: 320,
  armLengthSecondary: 240,
  magneticSnapEnabled: true,
  magneticSnapRadius: 20,
  arcLockRadius: 0,
  arcSnapStep: 50,
  elasticFlexDamping: 0.05,
  needleFrictionFactor: 0.75,
  renderOverlayEnabled: true,
};

export interface PantographFoleyTelemetry {
  angularVelocity: number;
  pivotFriction: number;
  strainCreak: number;
  needleScrapeHz: number;
  isSnapped: number;
}

export interface PantographJoints {
  anchor: [number, number];
  tracer: [number, number];
  pen: [number, number];
  elbowB: [number, number];
  elbowC: [number, number];
  elbowD: [number, number];
  polarRadius: number;
  polarAngleDeg: number;
  isArcSnapped: boolean;
  mechanicalStrain: number;
  foleyTelemetry: PantographFoleyTelemetry;
}

export interface TransformedPantographPoint {
  index: number;
  tracer: [number, number];
  pen: [number, number];
  joints: PantographJoints;
  isSnapped: boolean;
  strain: number;
  telemetry: PantographFoleyTelemetry;
}

/**
 * Validates and clamps pantograph linkage configuration parameters.
 */
export function validatePantographConfig(
  config?: Partial<PantographConfig>
): PantographConfig {
  if (!config) {
    return { ...DEFAULT_PANTOGRAPH_CONFIG };
  }

  const ax = Number.isFinite(config.anchorPoint?.[0]) ? Number(config.anchorPoint![0]) : DEFAULT_PANTOGRAPH_CONFIG.anchorPoint[0];
  const ay = Number.isFinite(config.anchorPoint?.[1]) ? Number(config.anchorPoint![1]) : DEFAULT_PANTOGRAPH_CONFIG.anchorPoint[1];

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_PANTOGRAPH_CONFIG.enabled),
    anchorPoint: [ax, ay],
    scaleRatio: Math.max(0.2, Math.min(5.0, Number(config.scaleRatio ?? DEFAULT_PANTOGRAPH_CONFIG.scaleRatio))),
    armLengthPrimary: Math.max(50, Math.min(1000, Number(config.armLengthPrimary ?? DEFAULT_PANTOGRAPH_CONFIG.armLengthPrimary))),
    armLengthSecondary: Math.max(50, Math.min(1000, Number(config.armLengthSecondary ?? DEFAULT_PANTOGRAPH_CONFIG.armLengthSecondary))),
    magneticSnapEnabled: Boolean(config.magneticSnapEnabled ?? DEFAULT_PANTOGRAPH_CONFIG.magneticSnapEnabled),
    magneticSnapRadius: Math.max(1, Math.min(200, Number(config.magneticSnapRadius ?? DEFAULT_PANTOGRAPH_CONFIG.magneticSnapRadius))),
    arcLockRadius: Math.max(0, Math.min(2000, Number(config.arcLockRadius ?? DEFAULT_PANTOGRAPH_CONFIG.arcLockRadius))),
    arcSnapStep: Math.max(5, Math.min(500, Number(config.arcSnapStep ?? DEFAULT_PANTOGRAPH_CONFIG.arcSnapStep))),
    elasticFlexDamping: Math.max(0.0, Math.min(0.5, Number(config.elasticFlexDamping ?? DEFAULT_PANTOGRAPH_CONFIG.elasticFlexDamping))),
    needleFrictionFactor: Math.max(0.0, Math.min(2.0, Number(config.needleFrictionFactor ?? DEFAULT_PANTOGRAPH_CONFIG.needleFrictionFactor))),
    renderOverlayEnabled: Boolean(config.renderOverlayEnabled ?? DEFAULT_PANTOGRAPH_CONFIG.renderOverlayEnabled),
  };
}

/**
 * Applies polar magnetic arc snapping relative to the fixed anchor point.
 */
export function applyMagneticArcConstraint(
  penPt: [number, number],
  anchorPt: [number, number],
  config?: Partial<PantographConfig>
): {
  snappedPoint: [number, number];
  isSnapped: boolean;
  polarRadius: number;
  polarAngleDeg: number;
} {
  const cfg = validatePantographConfig(config);
  const dx = penPt[0] - anchorPt[0];
  const dy = penPt[1] - anchorPt[1];
  const radius = Math.hypot(dx, dy);
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  if (!cfg.magneticSnapEnabled || radius < 1e-4) {
    return {
      snappedPoint: [penPt[0], penPt[1]],
      isSnapped: false,
      polarRadius: radius,
      polarAngleDeg: angleDeg,
    };
  }

  let targetR = 0;
  if (cfg.arcLockRadius > 0) {
    targetR = cfg.arcLockRadius;
  } else if (cfg.arcSnapStep > 0) {
    const ringIdx = Math.round(radius / cfg.arcSnapStep);
    targetR = Math.max(cfg.arcSnapStep, ringIdx * cfg.arcSnapStep);
  } else {
    return {
      snappedPoint: [penPt[0], penPt[1]],
      isSnapped: false,
      polarRadius: radius,
      polarAngleDeg: angleDeg,
    };
  }

  const deltaR = Math.abs(radius - targetR);
  const snapThresh = cfg.magneticSnapRadius;

  if (deltaR <= snapThresh) {
    // Hermite smoothstep elastic attraction
    const t = 1.0 - (deltaR / snapThresh);
    const pull = t * t * (3.0 - 2.0 * t);
    const effRadius = radius * (1.0 - pull) + targetR * pull;
    const snappedX = anchorPt[0] + effRadius * Math.cos(angleRad);
    const snappedY = anchorPt[1] + effRadius * Math.sin(angleRad);
    return {
      snappedPoint: [snappedX, snappedY],
      isSnapped: true,
      polarRadius: effRadius,
      polarAngleDeg: angleDeg,
    };
  }

  return {
    snappedPoint: [penPt[0], penPt[1]],
    isSnapped: false,
    polarRadius: radius,
    polarAngleDeg: angleDeg,
  };
}

/**
 * Computes forward kinematics of the 4-bar parallelogram pantograph linkage.
 */
export function solvePantographKinematics(
  tracerPt: [number, number],
  prevTracerPt?: [number, number],
  dt = 0.016,
  config?: Partial<PantographConfig>,
  prevVelocity?: [number, number]
): PantographJoints {
  const cfg = validatePantographConfig(config);
  const [ax, ay] = cfg.anchorPoint;
  const [tx, ty] = tracerPt;
  const ratio = cfg.scaleRatio;

  // Collinear Pantograph Property: P = A + R * (T - A)
  const idealPenX = ax + ratio * (tx - ax);
  const idealPenY = ay + ratio * (ty - ay);

  // Magnetic polar arc snap
  const { snappedPoint, isSnapped } = applyMagneticArcConstraint(
    [idealPenX, idealPenY],
    [ax, ay],
    cfg
  );

  // Mechanical strain & deflection from tracer acceleration
  let strain = 0.0;
  let deflectionX = 0.0;
  let deflectionY = 0.0;
  let angularVelocity = 0.0;

  if (prevTracerPt && dt > 1e-4) {
    const vx = (tx - prevTracerPt[0]) / dt;
    const vy = (ty - prevTracerPt[1]) / dt;

    let axAcc = 0.0;
    let ayAcc = 0.0;
    if (prevVelocity) {
      axAcc = (vx - prevVelocity[0]) / dt;
      ayAcc = (vy - prevVelocity[1]) / dt;
    } else {
      axAcc = vx / dt;
      ayAcc = vy / dt;
    }

    const accMag = Math.hypot(axAcc, ayAcc);
    strain = Math.min(1.0, accMag / 8000.0);

    const kFlex = cfg.elasticFlexDamping;
    deflectionX = -kFlex * axAcc * 0.01;
    deflectionY = -kFlex * ayAcc * 0.01;

    // Angular velocity around anchor
    const prevDx = prevTracerPt[0] - ax;
    const prevDy = prevTracerPt[1] - ay;
    const prevAngle = Math.atan2(prevDy, prevDx);
    const currAngle = Math.atan2(ty - ay, tx - ax);
    let dTheta = currAngle - prevAngle;
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    angularVelocity = Math.abs(dTheta) / dt;
  }

  const finalPenX = snappedPoint[0] + deflectionX;
  const finalPenY = snappedPoint[1] + deflectionY;

  const finalRadius = Math.hypot(finalPenX - ax, finalPenY - ay);
  const finalAngleDeg = (Math.atan2(finalPenY - ay, finalPenX - ax) * 180) / Math.PI;

  // Parallelogram scissor elbow joints
  const vPenX = finalPenX - ax;
  const vPenY = finalPenY - ay;
  const penDist = Math.hypot(vPenX, vPenY);

  const ux = penDist > 1e-4 ? vPenX / penDist : 1.0;
  const uy = penDist > 1e-4 ? vPenY / penDist : 0.0;

  const perpX = -uy;
  const perpY = ux;
  const elbowLateralOffset = 35.0;

  const elbowB: [number, number] = [
    ax + 0.65 * vPenX + elbowLateralOffset * perpX,
    ay + 0.65 * vPenY + elbowLateralOffset * perpY,
  ];

  const elbowC: [number, number] = [
    tx + elbowLateralOffset * perpX,
    ty + elbowLateralOffset * perpY,
  ];

  const elbowD: [number, number] = [
    ax + 0.5 * (tx - ax) + (elbowLateralOffset * 0.5) * perpX,
    ay + 0.5 * (ty - ay) + (elbowLateralOffset * 0.5) * perpY,
  ];

  const foley: PantographFoleyTelemetry = {
    angularVelocity,
    pivotFriction: Math.min(1.0, angularVelocity * 0.25 * cfg.needleFrictionFactor),
    strainCreak: strain * 0.85,
    needleScrapeHz: 800.0 + Math.min(2400.0, angularVelocity * 350.0),
    isSnapped: isSnapped ? 1.0 : 0.0,
  };

  return {
    anchor: [ax, ay],
    tracer: [tx, ty],
    pen: [finalPenX, finalPenY],
    elbowB,
    elbowC,
    elbowD,
    polarRadius: finalRadius,
    polarAngleDeg: finalAngleDeg,
    isArcSnapped: isSnapped,
    mechanicalStrain: strain,
    foleyTelemetry: foley,
  };
}

/**
 * Transforms an array of continuous tracer points into scaled,
 * arc-constrained, and strain-compensated pantograph drawing output points.
 */
export function transformStrokePantograph(
  strokePoints: Array<[number, number]>,
  config?: Partial<PantographConfig>,
  dt = 0.016
): TransformedPantographPoint[] {
  const cfg = validatePantographConfig(config);
  const results: TransformedPantographPoint[] = [];
  let prevPt: [number, number] | undefined = undefined;
  let prevVel: [number, number] | undefined = undefined;

  for (let i = 0; i < strokePoints.length; i++) {
    const pt = strokePoints[i];
    const joints = solvePantographKinematics(pt, prevPt, dt, cfg, prevVel);

    if (prevPt) {
      prevVel = [(pt[0] - prevPt[0]) / dt, (pt[1] - prevPt[1]) / dt];
    }
    prevPt = pt;

    results.push({
      index: i,
      tracer: joints.tracer,
      pen: joints.pen,
      joints,
      isSnapped: joints.isArcSnapped,
      strain: joints.mechanicalStrain,
      telemetry: joints.foleyTelemetry,
    });
  }

  return results;
}

/**
 * Generates vector SVG markup for the mechanical linkage arms, knurled rivets,
 * magnetic anchor disk, and guide arc.
 */
export function generatePantographSvgMarkup(
  joints: PantographJoints,
  config?: Partial<PantographConfig>
): string {
  const cfg = validatePantographConfig(config);
  if (!cfg.renderOverlayEnabled) {
    return '';
  }

  const [ax, ay] = joints.anchor;
  const [px, py] = joints.pen;
  const [tx, ty] = joints.tracer;
  const [bx, by] = joints.elbowB;
  const [cx, cy] = joints.elbowC;
  const [dx, dy] = joints.elbowD;

  const guideColor = joints.isArcSnapped ? '#e6a820' : '#888888';
  const guideOpacity = joints.isArcSnapped ? '0.75' : '0.35';
  const guideArcSvg = cfg.magneticSnapEnabled && joints.polarRadius > 5
    ? `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${joints.polarRadius.toFixed(1)}" fill="none" stroke="${guideColor}" stroke-width="1.5" stroke-dasharray="4,4" opacity="${guideOpacity}" />`
    : '';

  // Linkage bar paths
  const bars = [
    `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`,
    `M ${bx.toFixed(1)} ${by.toFixed(1)} L ${px.toFixed(1)} ${py.toFixed(1)}`,
    `M ${dx.toFixed(1)} ${dy.toFixed(1)} L ${cx.toFixed(1)} ${cy.toFixed(1)}`,
    `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`,
    `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`,
  ].join(' ');

  const jointNodes = [
    [bx, by],
    [cx, cy],
    [dx, dy],
    [tx, ty],
  ];

  const rivetsSvg = jointNodes
    .map(
      ([jx, jy]) =>
        `<g transform="translate(${jx.toFixed(1)}, ${jy.toFixed(1)})">
          <circle r="6" fill="#222" opacity="0.4" cx="1" cy="1" />
          <circle r="5" fill="#c0a060" stroke="#7a5818" stroke-width="1" />
          <circle r="2" fill="#333" />
        </g>`
    )
    .join('\n');

  return `
<g class="pantograph-linkage-overlay" pointer-events="none">
  ${guideArcSvg}
  <!-- Linkage bar drop shadows -->
  <path d="${bars}" fill="none" stroke="#000000" stroke-width="5" stroke-linecap="round" opacity="0.25" transform="translate(3, 3)" />
  <!-- Brass linkage bars -->
  <path d="${bars}" fill="none" stroke="#8c6a28" stroke-width="5" stroke-linecap="round" />
  <path d="${bars}" fill="none" stroke="#d4af37" stroke-width="3" stroke-linecap="round" />
  <path d="${bars}" fill="none" stroke="#fff0a0" stroke-width="1" stroke-linecap="round" opacity="0.6" />
  <!-- Joint Knurled Rivets -->
  ${rivetsSvg}
  <!-- Magnetic Anchor Disk Base -->
  <g transform="translate(${ax.toFixed(1)}, ${ay.toFixed(1)})">
    <circle r="18" fill="#1e1e24" stroke="#444" stroke-width="1.5" />
    <circle r="12" fill="#2a2a32" />
    <circle r="9" fill="none" stroke="#d32f2f" stroke-width="2" />
    <circle r="4" fill="#d4af37" />
    <circle r="1.5" fill="#fff" />
  </g>
  <!-- Stylus Pen Clamp Point -->
  <g transform="translate(${px.toFixed(1)}, ${py.toFixed(1)})">
    <circle r="7" fill="#1a1a1a" stroke="${joints.isArcSnapped ? '#4caf50' : '#d4af37'}" stroke-width="2" />
    <circle r="3" fill="#fff" />
  </g>
</g>`.trim();
}
