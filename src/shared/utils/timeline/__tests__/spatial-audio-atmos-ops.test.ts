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
  sphericalToCartesian3D,
  computeSurround51Pan,
  buildSurround51PanFilter,
  DEFAULT_TRACK_SPATIAL_SETTINGS,
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

  describe('Milestone S172: Studio Spatial 3D Audio Panning & Surround 5.1', () => {
    it('correctly maps spherical azimuth, elevation, and distance to 3D Cartesian coordinates', () => {
      // Directly in front at 2m (azimuth 0, elevation 0)
      const front = sphericalToCartesian3D(0, 0, 2.0);
      expect(front[0]).toBeCloseTo(0.0, 4);
      expect(front[1]).toBeCloseTo(2.0, 4);
      expect(front[2]).toBeCloseTo(1.2, 4); // listener ear level at 1.2m

      // Directly to the right at 2m (azimuth +90, elevation 0)
      const right = sphericalToCartesian3D(90, 0, 2.0);
      expect(right[0]).toBeCloseTo(2.0, 4);
      expect(right[1]).toBeCloseTo(0.0, 4);
      expect(right[2]).toBeCloseTo(1.2, 4);

      // Directly above at 2m (azimuth 0, elevation +90)
      const top = sphericalToCartesian3D(0, 90, 2.0);
      expect(top[0]).toBeCloseTo(0.0, 4);
      expect(top[1]).toBeCloseTo(0.0, 4);
      expect(top[2]).toBeCloseTo(3.2, 4);
    });

    it('computes Surround 5.1 cinema speaker bed gains with energy normalization', () => {
      // Center source (azimuth 0, elevation 0, distance 2m)
      const centerPos = sphericalToCartesian3D(0, 0, 2.0);
      const centerGains = computeSurround51Pan(centerPos);
      expect(centerGains.C).toBeGreaterThan(centerGains.L);
      expect(centerGains.C).toBeGreaterThan(centerGains.R);
      expect(centerGains.C).toBeGreaterThan(centerGains.Ls);
      expect(centerGains.C).toBeGreaterThan(centerGains.Rs);
      expect(centerGains.LFE).toBeGreaterThan(0);

      // Left surround source (azimuth -110, elevation 0, distance 2m)
      const lsPos = sphericalToCartesian3D(-110, 0, 2.0);
      const lsGains = computeSurround51Pan(lsPos);
      expect(lsGains.Ls).toBeGreaterThan(lsGains.L);
      expect(lsGains.Ls).toBeGreaterThan(lsGains.C);
      expect(lsGains.Ls).toBeGreaterThan(lsGains.Rs);

      // Right source (azimuth +30, elevation 0, distance 2m)
      const rPos = sphericalToCartesian3D(30, 0, 2.0);
      const rGains = computeSurround51Pan(rPos);
      expect(rGains.R).toBeGreaterThan(rGains.L);
      expect(rGains.R).toBeGreaterThan(rGains.Ls);

      // At reference distance (1.0m, distClamped = refD), distanceGain = 1.0 and squared sum of non-LFE is 1.0
      const refPos = sphericalToCartesian3D(0, 0, 1.0);
      const refGains = computeSurround51Pan(refPos);
      const refEnergy =
        refGains.L * refGains.L +
        refGains.R * refGains.R +
        refGains.C * refGains.C +
        refGains.Ls * refGains.Ls +
        refGains.Rs * refGains.Rs;
      expect(refEnergy).toBeCloseTo(1.0, 2);

      // At distance 2.0m, distanceGain = 0.5 (1/r falloff) and power is 0.25 (1/r^2)
      const energy2m =
        centerGains.L * centerGains.L +
        centerGains.R * centerGains.R +
        centerGains.C * centerGains.C +
        centerGains.Ls * centerGains.Ls +
        centerGains.Rs * centerGains.Rs;
      expect(energy2m).toBeCloseTo(0.25, 2);
    });

    it('synthesizes FFmpeg 5.1 pan filter string for mono and stereo sources', () => {
      const sourcePos = sphericalToCartesian3D(-30, 0, 2.0);
      const gains = computeSurround51Pan(sourcePos);
      const monoFilter = buildSurround51PanFilter(gains, false);
      expect(monoFilter).toContain('pan=5.1');
      expect(monoFilter).toContain(`c0=${Number(gains.L.toFixed(5))}*c0`);
      expect(monoFilter).toContain(`c1=${Number(gains.R.toFixed(5))}*c0`);
      expect(monoFilter).toContain(`c2=${Number(gains.C.toFixed(5))}*c0`);
      expect(monoFilter).toContain(`c3=${Number(gains.LFE.toFixed(5))}*c0`);
      expect(monoFilter).toContain(`c4=${Number(gains.Ls.toFixed(5))}*c0`);
      expect(monoFilter).toContain(`c5=${Number(gains.Rs.toFixed(5))}*c0`);

      const stereoFilter = buildSurround51PanFilter(gains, true);
      expect(stereoFilter).toContain('pan=5.1');
      expect(stereoFilter).toContain(`c0=${Number(gains.L.toFixed(5))}*c0`);
      expect(stereoFilter).toContain(`c1=${Number(gains.R.toFixed(5))}*c1`);
      expect(stereoFilter).toContain('c2=');
      expect(stereoFilter).toContain('*c0+');
      expect(stereoFilter).toContain('*c1');
    });

    it('provides sensible default track spatial settings', () => {
      expect(DEFAULT_TRACK_SPATIAL_SETTINGS.enabled).toBe(false);
      expect(DEFAULT_TRACK_SPATIAL_SETTINGS.azimuthDeg).toBe(0);
      expect(DEFAULT_TRACK_SPATIAL_SETTINGS.elevationDeg).toBe(0);
      expect(DEFAULT_TRACK_SPATIAL_SETTINGS.distanceM).toBe(2.0);
      expect(DEFAULT_TRACK_SPATIAL_SETTINGS.spreadDeg).toBe(30);
    });
  });
});
