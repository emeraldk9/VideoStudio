/**
 * Multi-Track Whiteboard Master Sequence Audio Stems & Dolby Atmos Spatial Panning Engine.
 *
 * Implements 3D soundstage coordinates, Woodworth-Schlosser binaural HRTF cues (ITD, ILD),
 * elevation pinna notch filtering, distance falloff attenuation, 7.1.4 Dolby Atmos speaker
 * bed energy-normalized matrix panning, and ITU-R BS.2076 ADM BWF XML metadata generation.
 */

export type MasterAudioFormat = 'StereoBinaural' | 'Surround51' | 'Atmos714' | 'ADM_BWF';

export type StemBusType = 'speech' | 'tool_foley' | 'eraser_foley' | 'music_bed' | 'ambience';

export interface SpatialAudioConfig {
  enabled: boolean;
  roomWidthM: number;              // Soundstage width in meters (4..20, default: 10.0)
  roomDepthM: number;              // Soundstage depth in meters (4..20, default: 8.0)
  roomHeightM: number;             // Soundstage ceiling height in meters (2.5..6.0, default: 3.5)
  listenerPos: [number, number, number]; // Listener ear-level position [x, y, z] in meters (default: [0, 0, 1.2])
  distanceFalloffExponent: number; // Geometric attenuation exponent (0.5..2.0, default: 1.0)
  referenceDistanceM: number;      // Reference falloff distance in meters (0.5..3.0, default: 1.0)
  airAbsorptionCoeff: number;      // Air damping coefficient per meter (0..0.01, default: 0.001)
  headRadiusM: number;             // Woodworth head sphere radius in meters (0.07..0.11, default: 0.0875)
  speedOfSoundMps: number;         // Acoustic propagation velocity in m/s (default: 343.0)
  hrtfBinauralEnabled: boolean;    // Calculate high-resolution ITD/ILD binaural cues (default: true)
  masterFormat: MasterAudioFormat; // Master downmix / stem delivery format
}

export type SpatialAudioSettings = Partial<SpatialAudioConfig>;

export const DEFAULT_SPATIAL_AUDIO_CONFIG: SpatialAudioConfig = {
  enabled: false,
  roomWidthM: 10.0,
  roomDepthM: 8.0,
  roomHeightM: 3.5,
  listenerPos: [0.0, 0.0, 1.2],
  distanceFalloffExponent: 1.0,
  referenceDistanceM: 1.0,
  airAbsorptionCoeff: 0.001,
  headRadiusM: 0.0875,
  speedOfSoundMps: 343.0,
  hrtfBinauralEnabled: true,
  masterFormat: 'Atmos714',
};

/**
 * Validates and clamps spatial audio configuration parameters.
 */
export function validateSpatialAudioConfig(
  config?: Partial<SpatialAudioConfig>
): SpatialAudioConfig {
  if (!config) {
    return { ...DEFAULT_SPATIAL_AUDIO_CONFIG };
  }

  const listenerPos: [number, number, number] = Array.isArray(config.listenerPos) && config.listenerPos.length === 3
    ? [
        Math.max(-10, Math.min(10, Number(config.listenerPos[0]) || 0)),
        Math.max(-10, Math.min(10, Number(config.listenerPos[1]) || 0)),
        Math.max(0.5, Math.min(3.0, Number(config.listenerPos[2]) || 1.2)),
      ]
    : [...DEFAULT_SPATIAL_AUDIO_CONFIG.listenerPos];

  const allowedFormats: MasterAudioFormat[] = ['StereoBinaural', 'Surround51', 'Atmos714', 'ADM_BWF'];
  const masterFormat = allowedFormats.includes(config.masterFormat as MasterAudioFormat)
    ? (config.masterFormat as MasterAudioFormat)
    : DEFAULT_SPATIAL_AUDIO_CONFIG.masterFormat;

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_SPATIAL_AUDIO_CONFIG.enabled),
    roomWidthM: Math.max(4.0, Math.min(20.0, Number(config.roomWidthM) || DEFAULT_SPATIAL_AUDIO_CONFIG.roomWidthM)),
    roomDepthM: Math.max(4.0, Math.min(20.0, Number(config.roomDepthM) || DEFAULT_SPATIAL_AUDIO_CONFIG.roomDepthM)),
    roomHeightM: Math.max(2.5, Math.min(6.0, Number(config.roomHeightM) || DEFAULT_SPATIAL_AUDIO_CONFIG.roomHeightM)),
    listenerPos,
    distanceFalloffExponent: Math.max(0.5, Math.min(2.0, Number(config.distanceFalloffExponent) || DEFAULT_SPATIAL_AUDIO_CONFIG.distanceFalloffExponent)),
    referenceDistanceM: Math.max(0.5, Math.min(3.0, Number(config.referenceDistanceM) || DEFAULT_SPATIAL_AUDIO_CONFIG.referenceDistanceM)),
    airAbsorptionCoeff: Math.max(0.0, Math.min(0.01, Number(config.airAbsorptionCoeff) || DEFAULT_SPATIAL_AUDIO_CONFIG.airAbsorptionCoeff)),
    headRadiusM: Math.max(0.07, Math.min(0.11, Number(config.headRadiusM) || DEFAULT_SPATIAL_AUDIO_CONFIG.headRadiusM)),
    speedOfSoundMps: Math.max(300.0, Math.min(360.0, Number(config.speedOfSoundMps) || DEFAULT_SPATIAL_AUDIO_CONFIG.speedOfSoundMps)),
    hrtfBinauralEnabled: Boolean(config.hrtfBinauralEnabled ?? DEFAULT_SPATIAL_AUDIO_CONFIG.hrtfBinauralEnabled),
    masterFormat,
  };
}

export interface SpatialSource {
  sourceId: string;
  name: string;
  stemBus: StemBusType;
  position: [number, number, number]; // [x, y, z] in meters
  gainDb: number;                     // Relative trim in dB (-60..+12)
  spreadDeg: number;                  // Radiation beam spread in degrees (0..180)
  sizeM: number;                      // Acoustic point source radius in meters
  priority: number;                   // 1 (low) .. 10 (critical)
}

export interface BinauralCues {
  azimuthDeg: number;
  elevationDeg: number;
  distanceM: number;
  distanceGain: number;
  itdSeconds: number;
  itdMs: number;
  delayLeftS: number;
  delayRightS: number;
  ildDb: number;
  gainLeft: number;
  gainRight: number;
  pinnaNotchHz: number;
}

export type AtmosSpeakerName = 'L' | 'R' | 'C' | 'LFE' | 'Ls' | 'Rs' | 'Lb' | 'Rb' | 'Tfl' | 'Tfr' | 'Tbl' | 'Tbr';

export type Atmos714PanGains = Record<AtmosSpeakerName, number>;

export const ATMOS_714_SPEAKER_COORDS: Record<AtmosSpeakerName, [number, number]> = {
  L: [-30.0, 0.0],
  R: [30.0, 0.0],
  C: [0.0, 0.0],
  LFE: [0.0, -20.0],
  Ls: [-90.0, 0.0],
  Rs: [90.0, 0.0],
  Lb: [-140.0, 0.0],
  Rb: [140.0, 0.0],
  Tfl: [-30.0, 45.0],
  Tfr: [30.0, 45.0],
  Tbl: [-140.0, 45.0],
  Tbr: [140.0, 45.0],
};

/**
 * Converts 2D canvas normalized coordinates [0, 1] to 3D listener soundstage coordinates (meters).
 */
export function canvasToSoundstage3D(
  xPct: number,
  yPct: number,
  zOffsetM: number = 0.0,
  boardWidthM: number = 3.0,
  boardDistanceM: number = 2.0,
  boardHeightM: number = 1.6875,
  boardCenterZM: number = 1.35
): [number, number, number] {
  const x = (xPct - 0.5) * boardWidthM;
  const y = boardDistanceM;
  const z = boardCenterZM + (0.5 - yPct) * boardHeightM + zOffsetM;
  return [
    Math.round(x * 10000) / 10000,
    Math.round(y * 10000) / 10000,
    Math.round(z * 10000) / 10000,
  ];
}

/**
 * Computes azimuth theta (radians, -pi..pi), elevation phi (radians, -pi/2..pi/2), and distance (m).
 */
export function computeRelativeAnglesAndDistance(
  sourcePos: [number, number, number],
  listenerPos: [number, number, number] = [0.0, 0.0, 1.2]
): { theta: number; phi: number; dist: number } {
  const dx = sourcePos[0] - listenerPos[0];
  const dy = sourcePos[1] - listenerPos[1];
  const dz = sourcePos[2] - listenerPos[2];

  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-6) {
    return { theta: 0.0, phi: 0.0, dist: 1e-6 };
  }

  const theta = Math.atan2(dx, dy);
  const horizDist = Math.sqrt(dx * dx + dy * dy);
  const phi = Math.atan2(dz, Math.max(1e-6, horizDist));

  return { theta, phi, dist };
}

/**
 * Computes Woodworth-Schlosser ITD, frequency-dependent ILD, distance attenuation,
 * and median plane pinna notch center frequency.
 */
export function computeBinauralHrtfCues(
  sourcePos: [number, number, number],
  config?: SpatialAudioConfig
): BinauralCues {
  const cfg = config || DEFAULT_SPATIAL_AUDIO_CONFIG;
  const { theta, phi, dist } = computeRelativeAnglesAndDistance(sourcePos, cfg.listenerPos);

  // 1. Distance Attenuation & Air Absorption
  const refD = Math.max(0.1, cfg.referenceDistanceM);
  const distClamped = Math.max(refD, dist);
  const attGeo = 1.0 / Math.pow(distClamped / refD, cfg.distanceFalloffExponent);
  const attAir = Math.exp(-cfg.airAbsorptionCoeff * dist);
  const distanceGain = attGeo * attAir;

  // 2. Woodworth-Schlosser Spherical Head ITD
  const absTheta = Math.abs(theta);
  let itdSec = (cfg.headRadiusM / cfg.speedOfSoundMps) * (Math.sin(absTheta) + absTheta);
  if (theta < 0) {
    itdSec = -itdSec;
  }

  const delayLeftS = Math.max(0.0, itdSec);
  const delayRightS = Math.max(0.0, -itdSec);

  // 3. Interaural Level Difference (ILD)
  let ildDb = 20.0 * Math.log10(Math.sqrt(1.0 + 3.0 * Math.pow(Math.sin(theta), 2)));
  if (theta < 0) {
    ildDb = -ildDb;
  }
  ildDb = Math.max(-20.0, Math.min(20.0, ildDb));

  const halfIld = ildDb / 2.0;
  const gainLeft = Math.pow(10.0, -halfIld / 20.0) * distanceGain;
  const gainRight = Math.pow(10.0, halfIld / 20.0) * distanceGain;

  // 4. Pinna Elevation Notch
  let pinnaNotchHz = 6500.0 + 3500.0 * Math.sin(phi);
  pinnaNotchHz = Math.max(4000.0, Math.min(12000.0, pinnaNotchHz));

  return {
    azimuthDeg: Math.round((theta * 180.0) / Math.PI * 100) / 100,
    elevationDeg: Math.round((phi * 180.0) / Math.PI * 100) / 100,
    distanceM: Math.round(dist * 10000) / 10000,
    distanceGain: Math.round(distanceGain * 100000) / 100000,
    itdSeconds: Math.round(itdSec * 100000000) / 100000000,
    itdMs: Math.round(itdSec * 1000 * 10000) / 10000,
    delayLeftS: Math.round(delayLeftS * 100000000) / 100000000,
    delayRightS: Math.round(delayRightS * 100000000) / 100000000,
    ildDb: Math.round(ildDb * 100) / 100,
    gainLeft: Math.round(gainLeft * 100000) / 100000,
    gainRight: Math.round(gainRight * 100000) / 100000,
    pinnaNotchHz: Math.round(pinnaNotchHz * 10) / 10,
  };
}

/**
 * Computes energy-normalized 7.1.4 Dolby Atmos speaker bed gains for a given 3D source position.
 */
export function computeAtmos714Pan(
  sourcePos: [number, number, number],
  config?: SpatialAudioConfig,
  spreadDeg: number = 0.0
): Atmos714PanGains {
  const cfg = config || DEFAULT_SPATIAL_AUDIO_CONFIG;
  const { theta, phi, dist } = computeRelativeAnglesAndDistance(sourcePos, cfg.listenerPos);

  const srcAzDeg = (theta * 180.0) / Math.PI;
  const srcElDeg = (phi * 180.0) / Math.PI;

  const refD = Math.max(0.1, cfg.referenceDistanceM);
  const distClamped = Math.max(refD, dist);
  const distanceGain = 1.0 / Math.pow(distClamped / refD, cfg.distanceFalloffExponent);

  const weights: Record<string, number> = {};
  const effectiveSpread = Math.max(15.0, spreadDeg + 25.0);

  for (const [chName, [spkAz, spkEl]] of Object.entries(ATMOS_714_SPEAKER_COORDS)) {
    if (chName === 'LFE') {
      weights[chName] = 0.05;
      continue;
    }

    const dAz = ((srcAzDeg - spkAz + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
    const dEl = srcElDeg - spkEl;
    const angDist = Math.sqrt(dAz * dAz + dEl * dEl);

    const w = Math.exp(-0.5 * Math.pow(angDist / effectiveSpread, 2));
    weights[chName] = Math.max(1e-6, w);
  }

  let sumSq = 0.0;
  for (const [ch, w] of Object.entries(weights)) {
    if (ch !== 'LFE') {
      sumSq += w * w;
    }
  }
  const normFactor = 1.0 / Math.sqrt(Math.max(1e-9, sumSq));

  const result: Partial<Atmos714PanGains> = {};
  for (const [ch, w] of Object.entries(weights)) {
    const key = ch as AtmosSpeakerName;
    if (key === 'LFE') {
      result[key] = Math.round(w * distanceGain * 100000) / 100000;
    } else {
      result[key] = Math.round(w * normFactor * distanceGain * 100000) / 100000;
    }
  }

  return result as Atmos714PanGains;
}

/**
 * Generates ITU-R BS.2076 Audio Definition Model (ADM) XML metadata for Dolby Atmos master stems.
 */
export function generateAdmBwfXml(
  sources: SpatialSource[],
  projectTitle: string = 'WhiteboardMasterSequence',
  sampleRate: number = 48000
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ituBS2076:audioFormatExtended xmlns:ituBS2076="urn:itu:bs:2076:1">',
    `  <audioProgramme audioProgrammeID="APR_1001" audioProgrammeName="${projectTitle}">`,
    '    <audioContentIDRef>ACO_1001</audioContentIDRef>',
    '  </audioProgramme>',
    '  <audioContent audioContentID="ACO_1001" audioContentName="Whiteboard_Master_Stems">',
  ];

  sources.forEach((_, i) => {
    lines.push(`    <audioObjectIDRef>AO_${1001 + i}</audioObjectIDRef>`);
  });
  lines.push('  </audioContent>');

  sources.forEach((src, i) => {
    const objId = `AO_${1001 + i}`;
    const packId = `AP_${1001 + i}`;
    const trackUid = `ATU_0000${String(i + 1).padStart(4, '0')}`;
    const chFormatId = `AC_${1001 + i}`;

    const normX = Math.max(-1.0, Math.min(1.0, src.position[0] / 5.0)).toFixed(4);
    const normY = Math.max(-1.0, Math.min(1.0, src.position[1] / 5.0)).toFixed(4);
    const normZ = Math.max(-1.0, Math.min(1.0, (src.position[2] - 1.2) / 2.0)).toFixed(4);
    const linGain = Math.pow(10.0, src.gainDb / 20.0).toFixed(4);
    const diffuse = Math.min(1.0, src.spreadDeg / 180.0).toFixed(4);

    lines.push(
      `  <audioObject audioObjectID="${objId}" audioObjectName="${src.name}">`,
      `    <audioPackFormatIDRef>${packId}</audioPackFormatIDRef>`,
      `    <audioTrackUIDRef>${trackUid}</audioTrackUIDRef>`,
      `    <gain>${linGain}</gain>`,
      '    <channelLock>0</channelLock>',
      '  </audioObject>',
      `  <audioPackFormat audioPackFormatID="${packId}" audioPackFormatName="${src.name}_Pack" typeDefinition="DirectSpeakers">`,
      `    <audioChannelFormatIDRef>${chFormatId}</audioChannelFormatIDRef>`,
      '  </audioPackFormat>',
      `  <audioChannelFormat audioChannelFormatID="${chFormatId}" audioChannelFormatName="${src.name}_Channel" typeDefinition="Objects">`,
      `    <audioBlockFormat audioBlockFormatID="AB_${1001 + i}_00000001" rtime="00:00:00.00000" duration="00:01:00.00000">`,
      '      <cartesian>1</cartesian>',
      `      <position coordinate="X">${normX}</position>`,
      `      <position coordinate="Y">${normY}</position>`,
      `      <position coordinate="Z">${normZ}</position>`,
      `      <gain>${linGain}</gain>`,
      `      <diffuse>${diffuse}</diffuse>`,
      '    </audioBlockFormat>',
      '  </audioChannelFormat>'
    );
  });

  lines.push('</ituBS2076:audioFormatExtended>');
  return lines.join('\n');
}

/**
 * Orchestrates multi-track whiteboard master sequence audio stems.
 */
export class SpatialMasterMixer {
  private config: SpatialAudioConfig;
  private sources: Map<string, SpatialSource> = new Map();

  constructor(config?: Partial<SpatialAudioConfig>) {
    this.config = validateSpatialAudioConfig(config);
  }

  public addSource(source: SpatialSource): void {
    this.sources.set(source.sourceId, { ...source });
  }

  public updateSourcePosition(sourceId: string, position: [number, number, number]): void {
    const existing = this.sources.get(sourceId);
    if (existing) {
      this.sources.set(sourceId, { ...existing, position: [...position] });
    }
  }

  public getSources(): SpatialSource[] {
    return Array.from(this.sources.values());
  }

  public renderBinauralState(): Record<string, BinauralCues> {
    const state: Record<string, BinauralCues> = {};
    for (const [id, src] of this.sources.entries()) {
      state[id] = computeBinauralHrtfCues(src.position, this.config);
    }
    return state;
  }

  public renderAtmos714State(): Record<string, Atmos714PanGains> {
    const state: Record<string, Atmos714PanGains> = {};
    for (const [id, src] of this.sources.entries()) {
      state[id] = computeAtmos714Pan(src.position, this.config, src.spreadDeg);
    }
    return state;
  }

  public exportAdmBwfMetadata(title: string = 'WhiteboardMaster'): string {
    return generateAdmBwfXml(Array.from(this.sources.values()), title);
  }
}

/**
 * Generates an SVG 2D top-down soundstage diagram illustrating listener position,
 * speaker layout (7.1.4), and dynamic stem audio source nodes.
 */
export function generateSpatialStageSvgMarkup(
  sources: SpatialSource[],
  listenerPos: [number, number, number] = [0.0, 0.0, 1.2],
  width: number = 360,
  height: number = 260
): string {
  const originX = width / 2;
  const originY = height * 0.75;
  const scale = width / 8.0; // 8 meters visible width

  // Transform soundstage coordinates (X, Y) to SVG (cx, cy)
  const toSvg = (x: number, y: number): [number, number] => {
    return [originX + x * scale, originY - y * scale];
  };

  const elements: string[] = [];

  // Stage boundaries & grid
  elements.push(`
    <rect width="${width}" height="${height}" fill="#0d1117" rx="8" />
    <circle cx="${originX}" cy="${originY}" r="${scale * 1.5}" fill="none" stroke="#21262d" stroke-dasharray="3 3" />
    <circle cx="${originX}" cy="${originY}" r="${scale * 3.0}" fill="none" stroke="#21262d" stroke-dasharray="3 3" />
  `);

  // Whiteboard screen representation (top of soundstage)
  const [boardL_x, boardL_y] = toSvg(-1.5, 2.0);
  const [boardR_x, boardR_y] = toSvg(1.5, 2.0);
  elements.push(`
    <line x1="${boardL_x}" y1="${boardL_y}" x2="${boardR_x}" y2="${boardR_y}" stroke="#388bfd" stroke-width="4" stroke-linecap="round" />
    <text x="${originX}" y="${boardL_y - 8}" fill="#58a6ff" font-size="10" font-family="sans-serif" text-anchor="middle">Whiteboard Surface</text>
  `);

  // Listener head (origin)
  const [listX, listY] = toSvg(listenerPos[0], listenerPos[1]);
  elements.push(`
    <circle cx="${listX}" cy="${listY}" r="7" fill="#238636" stroke="#2ea043" stroke-width="2" />
    <polygon points="${listX - 4},${listY - 6} ${listX + 4},${listY - 6} ${listX},${listY - 12}" fill="#2ea043" />
    <text x="${listX}" y="${listY + 16}" fill="#7ee787" font-size="9" font-family="sans-serif" text-anchor="middle">Listener</text>
  `);

  // Source nodes
  const stemColors: Record<StemBusType, string> = {
    speech: '#f0883e',
    tool_foley: '#a371f7',
    eraser_foley: '#d29922',
    music_bed: '#3fb950',
    ambience: '#8b949e',
  };

  sources.forEach((src) => {
    const [sx, sy] = toSvg(src.position[0], src.position[1]);
    const col = stemColors[src.stemBus] || '#f0883e';
    const haloRadius = Math.max(8, (src.spreadDeg / 180.0) * 24);

    elements.push(`
      <circle cx="${sx}" cy="${sy}" r="${haloRadius}" fill="${col}" fill-opacity="0.15" />
      <circle cx="${sx}" cy="${sy}" r="5" fill="${col}" stroke="#ffffff" stroke-width="1.5" />
      <line x1="${listX}" y1="${listY}" x2="${sx}" y2="${sy}" stroke="${col}" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0.6" />
      <text x="${sx}" y="${sy - 8}" fill="${col}" font-size="9" font-family="sans-serif" text-anchor="middle">${src.name}</text>
    `);
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`;
}
