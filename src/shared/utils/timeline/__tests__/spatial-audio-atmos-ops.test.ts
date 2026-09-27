import { describe, it, expect } from 'vitest';
import {
  validateSpatialAudioConfig,
  canvasToSoundstage3D,
  computeRelativeAnglesAndDistance,
  computeBinauralHrtfCues,
  computeAtmos714Pan,
  generateAdmBwfXml,
  SpatialMasterMixer,
  generateSpatialStageSvgMarkup,
  DEFAULT_SPATIAL_AUDIO_CONFIG,
  SpatialSource,
  buildAtmos714PanFilter,
  buildBinauralHrtfFilter,
} from '../spatial-audio-atmos-ops';

describe('spatial-audio-atmos-ops', () => {
  it('validates and clamps default and custom spatial audio configurations', () => {
    const defaults = validateSpatialAudioConfig();
    expect(defaults.enabled).toBe(false);
    expect(defaults.roomWidthM).toBe(10.0);
    expect(defaults.roomDepthM).toBe(8.0);
    expect(defaults.masterFormat).toBe('Atmos714');
    expect(defaults.hrtfBinauralEnabled).toBe(true);

    const clamped = validateSpatialAudioConfig({
      roomWidthM: 100.0,
      roomDepthM: 1.0,
      distanceFalloffExponent: 5.0,
      airAbsorptionCoeff: 0.5,
      masterFormat: 'StereoBinaural',
    });
    expect(clamped.roomWidthM).toBe(20.0);
    expect(clamped.roomDepthM).toBe(4.0);
    expect(clamped.distanceFalloffExponent).toBe(2.0);
    expect(clamped.airAbsorptionCoeff).toBe(0.01);
    expect(clamped.masterFormat).toBe('StereoBinaural');
  });

  it('correctly maps 2D canvas coordinates to 3D listener soundstage coordinates', () => {
    // Center of whiteboard
    const center = canvasToSoundstage3D(0.5, 0.5, 0.0, 3.0, 2.0);
    expect(center[0]).toBe(0.0);
    expect(center[1]).toBe(2.0);
    expect(center[2]).toBe(1.35);

    // Top left of board
    const topLeft = canvasToSoundstage3D(0.0, 0.0, 0.0, 3.0, 2.0);
    expect(topLeft[0]).toBe(-1.5);
    expect(topLeft[1]).toBe(2.0);
    expect(topLeft[2]).toBeGreaterThan(1.35);

    // Bottom right of board
    const bottomRight = canvasToSoundstage3D(1.0, 1.0, 0.0, 3.0, 2.0);
    expect(bottomRight[0]).toBe(1.5);
    expect(bottomRight[1]).toBe(2.0);
    expect(bottomRight[2]).toBeLessThan(1.35);
  });

  it('computes spherical azimuth, elevation, and Euclidean distance from listener', () => {
    const sourcePos: [number, number, number] = [1.5, 2.0, 1.35];
    const listenerPos: [number, number, number] = [0.0, 0.0, 1.2];
    const { theta, phi, dist } = computeRelativeAnglesAndDistance(sourcePos, listenerPos);

    expect(theta).toBeGreaterThan(0); // Source on the right
    expect(phi).toBeGreaterThan(0);   // Source slightly above ear level
    expect(dist).toBeCloseTo(Math.sqrt(1.5 * 1.5 + 2.0 * 2.0 + 0.15 * 0.15), 3);
  });

  it('computes Woodworth-Schlosser binaural cues (ITD, ILD, pinna notch)', () => {
    const cfg = validateSpatialAudioConfig({ enabled: true, hrtfBinauralEnabled: true });

    // Source to the left
    const leftCues = computeBinauralHrtfCues([-1.5, 2.0, 1.35], cfg);
    expect(leftCues.azimuthDeg).toBeLessThan(-20.0);
    expect(leftCues.delayRightS).toBeGreaterThan(leftCues.delayLeftS);
    expect(leftCues.gainLeft).toBeGreaterThan(leftCues.gainRight);
    expect(leftCues.itdMs).toBeLessThan(0);
    expect(leftCues.pinnaNotchHz).toBeGreaterThan(6500);

    // Source to the right
    const rightCues = computeBinauralHrtfCues([1.5, 2.0, 1.35], cfg);
    expect(rightCues.azimuthDeg).toBeGreaterThan(20.0);
    expect(rightCues.delayLeftS).toBeGreaterThan(rightCues.delayRightS);
    expect(rightCues.gainRight).toBeGreaterThan(rightCues.gainLeft);
    expect(rightCues.itdMs).toBeGreaterThan(0);
  });

  it('computes energy-conserving 7.1.4 Dolby Atmos speaker bed matrix gains', () => {
    const cfg = validateSpatialAudioConfig({ enabled: true });

    // Left source
    const leftPan = computeAtmos714Pan([-1.5, 2.0, 1.35], cfg);
    expect(leftPan.L).toBeGreaterThan(leftPan.R);
    expect(leftPan.Ls).toBeGreaterThan(leftPan.Rs);
    expect(leftPan.Tfl).toBeGreaterThan(leftPan.Tfr);

    // Right source
    const rightPan = computeAtmos714Pan([1.5, 2.0, 1.35], cfg);
    expect(rightPan.R).toBeGreaterThan(rightPan.L);
    expect(rightPan.Rs).toBeGreaterThan(rightPan.Ls);
    expect(rightPan.Tfr).toBeGreaterThan(rightPan.Tfl);

    // Center speaker gets strong signal for centered source
    const centerPan = computeAtmos714Pan([0.0, 2.0, 1.35], cfg);
    expect(centerPan.C).toBeGreaterThan(centerPan.Ls);
  });

  it('generates ITU-R BS.2076 ADM BWF XML metadata package for master DAW export', () => {
    const sources: SpatialSource[] = [
      {
        sourceId: 'src_speech',
        name: 'Presenter_Speech',
        stemBus: 'speech',
        position: [0.0, 1.5, 1.6],
        gainDb: 0.0,
        spreadDeg: 0.0,
        sizeM: 0.1,
        priority: 1,
      },
      {
        sourceId: 'src_tool',
        name: 'Marker_Nib',
        stemBus: 'tool_foley',
        position: [-0.75, 2.0, 1.4],
        gainDb: -3.0,
        spreadDeg: 15.0,
        sizeM: 0.05,
        priority: 2,
      },
    ];

    const xml = generateAdmBwfXml(sources, 'Episode1_Master');
    expect(xml).toContain('<ituBS2076:audioFormatExtended');
    expect(xml).toContain('audioProgrammeName="Episode1_Master"');
    expect(xml).toContain('audioObjectName="Presenter_Speech"');
    expect(xml).toContain('audioObjectName="Marker_Nib"');
    expect(xml).toContain('<position coordinate="X">');
    expect(xml).toContain('</ituBS2076:audioFormatExtended>');
  });

  it('manages dynamic multi-track source orchestration and renders audio states', () => {
    const mixer = new SpatialMasterMixer({ enabled: true });

    mixer.addSource({
      sourceId: 'src_pen',
      name: 'Pen Nib',
      stemBus: 'tool_foley',
      position: [-1.2, 2.0, 1.35],
      gainDb: 0.0,
      spreadDeg: 0.0,
      sizeM: 0.05,
      priority: 1,
    });

    const initialBinaural = mixer.renderBinauralState();
    expect(initialBinaural.src_pen.azimuthDeg).toBeLessThan(0);

    // Move pen to the right side of the canvas
    mixer.updateSourcePosition('src_pen', [1.2, 2.0, 1.35]);
    const updatedBinaural = mixer.renderBinauralState();
    expect(updatedBinaural.src_pen.azimuthDeg).toBeGreaterThan(0);

    const atmosState = mixer.renderAtmos714State();
    expect(atmosState.src_pen.R).toBeGreaterThan(atmosState.src_pen.L);

    // Export ADM BWF XML metadata
    const xml = mixer.exportAdmBwfMetadata('Whiteboard_Atmos');
    expect(xml.length).toBeGreaterThan(200);

    // Generate 2D SVG soundstage visualization
    const svg = generateSpatialStageSvgMarkup(mixer.getSources());
    expect(svg).toContain('<svg');
    expect(svg).toContain('Whiteboard Surface');
    expect(svg).toContain('Listener');
    expect(svg).toContain('Pen Nib');
  });

  describe('Milestone S157: FFmpeg Filter Synthesis for Atmos 7.1.4 & Binaural HRTF', () => {
    it('synthesizes mono FFmpeg pan filter for 7.1.4 speaker bed layout', () => {
      const gains = computeAtmos714Pan([-1.5, 2.0, 1.35]);
      const filter = buildAtmos714PanFilter(gains, false);

      expect(filter).toContain('pan=7.1.4');
      expect(filter).toContain(`c0=${Number(gains.L.toFixed(5))}*c0`);
      expect(filter).toContain(`c1=${Number(gains.R.toFixed(5))}*c0`);
      expect(filter).toContain(`c2=${Number(gains.C.toFixed(5))}*c0`);
      expect(filter).toContain(`c3=${Number(gains.LFE.toFixed(5))}*c0`);
      expect(filter).toContain(`c6=${Number(gains.Ls.toFixed(5))}*c0`);
      expect(filter).toContain(`c7=${Number(gains.Rs.toFixed(5))}*c0`);
      expect(filter).toContain(`c8=${Number(gains.Tfl.toFixed(5))}*c0`);
      expect(filter).toContain(`c9=${Number(gains.Tfr.toFixed(5))}*c0`);
      expect(filter).toContain(`c10=${Number(gains.Tbl.toFixed(5))}*c0`);
      expect(filter).toContain(`c11=${Number(gains.Tbr.toFixed(5))}*c0`);
    });

    it('synthesizes stereo FFmpeg pan filter for 7.1.4 speaker bed layout with split channel routing', () => {
      const gains = computeAtmos714Pan([1.5, 2.0, 1.35]);
      const filter = buildAtmos714PanFilter(gains, true);

      expect(filter).toContain('pan=7.1.4');
      // Left speaker driven by c0, right by c1
      expect(filter).toContain(`c0=${Number(gains.L.toFixed(5))}*c0`);
      expect(filter).toContain(`c1=${Number(gains.R.toFixed(5))}*c1`);
      // Center and LFE sum both c0 and c1
      const halfC = Number((gains.C * 0.5).toFixed(5));
      expect(filter).toContain(`c2=${halfC}*c0+${halfC}*c1`);
      expect(filter).toContain(`c8=${Number(gains.Tfl.toFixed(5))}*c0`);
      expect(filter).toContain(`c9=${Number(gains.Tfr.toFixed(5))}*c1`);
    });

    it('synthesizes binaural HRTF filter chain with pan, adelay, and pinna notch equalizer', () => {
      const cues = computeBinauralHrtfCues([-1.5, 2.0, 1.35]);
      const filter = buildBinauralHrtfFilter(cues, false);

      expect(filter).toContain('pan=stereo');
      expect(filter).toContain(`c0=${Number(cues.gainLeft.toFixed(5))}*c0`);
      expect(filter).toContain(`c1=${Number(cues.gainRight.toFixed(5))}*c0`);
      expect(filter).toContain('adelay=');
      expect(filter).toContain('equalizer=f=');
      expect(filter).toContain(':t=q:w=2.0:g=-6');
    });

    it('synthesizes stereo input binaural HRTF filter chain', () => {
      const cues = computeBinauralHrtfCues([1.5, 2.0, 1.35]);
      const filter = buildBinauralHrtfFilter(cues, true);

      expect(filter).toContain('pan=stereo');
      expect(filter).toContain(`c0=${Number(cues.gainLeft.toFixed(5))}*c0`);
      expect(filter).toContain(`c1=${Number(cues.gainRight.toFixed(5))}*c1`);
      expect(filter).toContain('adelay=');
      expect(filter).toContain(`equalizer=f=${Math.round(cues.pinnaNotchHz)}`);
    });
  });
});
