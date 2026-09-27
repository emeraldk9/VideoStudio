import { describe, expect, it } from 'vitest';
import {
  SPRING_PRESETS,
  calculateKineticMotionTransform,
  calculateResponsiveAnimationDurations,
  calculateSpeechTypewriterSlice,
  evaluateCustomEasing,
  formatAssTimecode,
  generateAssSubtitleScript,
  hexToAssColor,
  mapToAssAlignment,
  solveSpring,
} from '../kinetic-motion-ops';
import { SMART_TEXT_TEMPLATES } from '../text-template-ops';
import type { SequenceClip } from '../../../types/sequence';

describe('kinetic-motion-ops (Milestone S167: Kinetic Typography & Motion Title Presets)', () => {
  describe('Spring Physics Analytical Solver (solveSpring)', () => {
    it('starts at 0.0 displacement at t = 0', () => {
      expect(solveSpring(0)).toBe(0);
      expect(solveSpring(-0.5)).toBe(0);
    });

    it('overshoots 1.0 with underdamped bouncy spring configuration', () => {
      // Find peak overshoot between t = 0.1 and t = 0.5
      let maxVal = 0;
      for (let t = 0.05; t <= 0.5; t += 0.02) {
        const val = solveSpring(t, SPRING_PRESETS.bouncy);
        if (val > maxVal) maxVal = val;
      }
      expect(maxVal).toBeGreaterThan(1.05); // Noticeable elastic bounce
    });

    it('converges closely to equilibrium (1.0) after settling', () => {
      const settled = solveSpring(2.0, SPRING_PRESETS.default);
      expect(settled).toBeCloseTo(1.0, 1);
    });

    it('handles snappy and gentle presets stably', () => {
      const snappyMid = solveSpring(0.15, SPRING_PRESETS.snappy);
      expect(snappyMid).toBeGreaterThan(0.5);

      const gentleMid = solveSpring(0.15, SPRING_PRESETS.gentle);
      expect(gentleMid).toBeGreaterThan(0.1);
    });
  });

  describe('Custom Easing Evaluator (evaluateCustomEasing)', () => {
    it('evaluates linear easing', () => {
      expect(evaluateCustomEasing(0, 'linear')).toBe(0);
      expect(evaluateCustomEasing(0.5, 'linear')).toBe(0.5);
      expect(evaluateCustomEasing(1, 'linear')).toBe(1);
    });

    it('evaluates smooth cubic ease-out', () => {
      expect(evaluateCustomEasing(0, 'ease_out')).toBe(0);
      expect(evaluateCustomEasing(0.5, 'ease_out')).toBeGreaterThan(0.7); // Front-loaded progress
      expect(evaluateCustomEasing(1, 'ease_out')).toBe(1);
    });

    it('evaluates symmetric ease-in-out', () => {
      expect(evaluateCustomEasing(0, 'ease_in_out')).toBe(0);
      expect(evaluateCustomEasing(0.5, 'ease_in_out')).toBe(0.5);
      expect(evaluateCustomEasing(1, 'ease_in_out')).toBe(1);
    });

    it('evaluates spring easing with overshoot', () => {
      let overshot = false;
      for (let t = 0.1; t <= 0.9; t += 0.05) {
        if (evaluateCustomEasing(t, 'spring') > 1.0) {
          overshot = true;
          break;
        }
      }
      expect(overshot).toBe(true);
    });

    it('evaluates elastic easing', () => {
      expect(evaluateCustomEasing(0, 'elastic')).toBe(0);
      expect(evaluateCustomEasing(1, 'elastic')).toBe(1);
    });
  });

  describe('Duration-Responsive Animation Timing (calculateResponsiveAnimationDurations)', () => {
    it('preserves full durations when clip is long enough', () => {
      const res = calculateResponsiveAnimationDurations(30, 24, 300, 0.4);
      expect(res.inDurationFrames).toBe(30);
      expect(res.outDurationFrames).toBe(24);
      expect(res.exitStartFrame).toBe(276); // 300 - 24
      expect(res.isClamped).toBe(false);
    });

    it('clamps in/out durations proportionally when clip is trimmed short', () => {
      // 30-frame clip with 40% boundary cap -> max 12 frames per phase
      const res = calculateResponsiveAnimationDurations(30, 30, 30, 0.4);
      expect(res.inDurationFrames).toBe(12);
      expect(res.outDurationFrames).toBe(12);
      expect(res.exitStartFrame).toBe(18); // 30 - 12
      expect(res.isClamped).toBe(true);
      expect(res.inDurationFrames).toBeLessThanOrEqual(res.exitStartFrame);
    });

    it('guarantees entrance and exit never collide even on 2-frame micro clips', () => {
      const res = calculateResponsiveAnimationDurations(20, 20, 2, 0.4);
      expect(res.inDurationFrames).toBeGreaterThanOrEqual(1);
      expect(res.outDurationFrames).toBeGreaterThanOrEqual(1);
      expect(res.exitStartFrame).toBeGreaterThanOrEqual(res.inDurationFrames);
    });
  });

  describe('Speech Typewriter Cadence & Cursor (calculateSpeechTypewriterSlice)', () => {
    it('reveals text progressively with cursor indicator', () => {
      const text = 'Hello world! Welcome to VideoStudio.';
      const start = calculateSpeechTypewriterSlice(text, 0, 60, true);
      expect(start.text).toBe('');
      expect(start.cursor).toBe('|');
      expect(start.isComplete).toBe(false);

      const mid = calculateSpeechTypewriterSlice(text, 30, 60, true);
      expect(mid.text.length).toBeGreaterThan(0);
      expect(mid.text.length).toBeLessThan(text.length);

      const end = calculateSpeechTypewriterSlice(text, 65, 60, false);
      expect(end.text).toBe(text);
      expect(end.cursor).toBe('');
      expect(end.isComplete).toBe(true);
    });

    it('weights punctuation pauses so sentences breathe naturally', () => {
      const withPunct = 'Wait... GO!';
      // Early frame should show the word 'Wait' and pause on dots
      const slice1 = calculateSpeechTypewriterSlice(withPunct, 15, 60, false);
      expect(slice1.text).toContain('Wait');
    });
  });

  describe('S167 Kinetic Motion Transformations (calculateKineticMotionTransform)', () => {
    it('computes kinetic_pop_in with spring bounce and rotation', () => {
      const earlyState = calculateKineticMotionTransform('kinetic_pop_in', 5, 20);
      expect(earlyState.transform).toContain('scale(');
      expect(earlyState.transform).toContain('rotate(');
      expect(earlyState.opacity).toBeDefined();
    });

    it('computes minimal_lower_third horizontal slide-in', () => {
      const state = calculateKineticMotionTransform('minimal_lower_third', 5, 20);
      expect(state.transform).toContain('translateX(');
      expect(state.opacity).toBeDefined();
    });

    it('computes glitch_distortion with chromatic aberration text-shadow', () => {
      const state = calculateKineticMotionTransform('glitch_distortion', 4, 20);
      expect(state.transform).toContain('translate(');
      expect(state.textShadow).toContain('rgba(255, 0, 85');
      expect(state.textShadow).toContain('rgba(0, 240, 255');
    });

    it('computes cinematic_glow_fade with soft luminous blur', () => {
      const state = calculateKineticMotionTransform('cinematic_glow_fade', 4, 30);
      expect(state.transform).toContain('scale(');
      expect(state.textShadow).toContain('rgba(255, 255, 255');
    });
  });

  describe('ASS Subtitle Stream Synthesis', () => {
    it('formats frame count to ASS centisecond timecode (H:MM:SS.cs)', () => {
      expect(formatAssTimecode(0, 30)).toBe('0:00:00.00');
      expect(formatAssTimecode(30, 30)).toBe('0:00:01.00');
      expect(formatAssTimecode(45, 30)).toBe('0:00:01.50');
      expect(formatAssTimecode(3600 * 30, 30)).toBe('1:00:00.00');
    });

    it('converts CSS hex colors to ASS BGR color strings (&HAABBGGRR&)', () => {
      // Pure Red #FF0000 -> Opaque: &H000000FF& (BGR order)
      expect(hexToAssColor('#FF0000', 1.0)).toBe('&H000000FF&');
      // Pure Blue #0000FF -> &H00FF0000&
      expect(hexToAssColor('#0000FF', 1.0)).toBe('&H00FF0000&');
      // 50% opacity pure white #FFFFFF -> Alpha ~ 128 (0x80)
      expect(hexToAssColor('#FFFFFF', 0.5)).toBe('&H80FFFFFF&');
    });

    it('maps text alignment & anchor to ASS numpad alignment code', () => {
      expect(mapToAssAlignment('center', 'middle')).toBe(5); // Numpad 5 = center-center
      expect(mapToAssAlignment('left', 'bottom')).toBe(1);   // Numpad 1 = bottom-left
      expect(mapToAssAlignment('right', 'top')).toBe(9);     // Numpad 9 = top-right
    });

    it('generates complete ASS subtitle script from text clips', () => {
      const mockClip: SequenceClip = {
        id: 'clip-text-1',
        sequenceId: 'seq-1',
        trackId: 'track-text',
        orderIndex: 0,
        sourceKind: 'text',
        filePath: null,
        outputId: null,
        storyShotId: null,
        sourceTakeId: null,
        startFrames: 30,
        durationFrames: 90,
        sourceInFrames: null,
        sourceOutFrames: null,
        transitionIn: 'cut',
        transitionFrames: 0,
        motionPreset: 'none',
        gainDb: 0,
        fadeInFrames: 0,
        fadeOutFrames: 0,
        label: 'Title Clip',
        overrides: [],
        effects: {
          text: {
            text: 'CINEMATIC TITLE\nSecond Line Subtitle',
            fontSizePx: 72,
            colorHex: '#FFFFFF',
            align: 'center',
            anchor: 'middle',
            positionPct: { x: 0.5, y: 0.5 },
            preset: 'title',
            fontFamily: 'Montserrat',
            stroke: { colorHex: '#000000', widthPx: 3 },
            compoundAnimation: {
              inDurationFrames: 15,
              outDurationFrames: 15,
            },
          },
        },
      };

      const script = generateAssSubtitleScript([mockClip], {
        sequenceFps: 30,
        width: 1920,
        height: 1080,
      });

      expect(script).toContain('[Script Info]');
      expect(script).toContain('PlayResX: 1920');
      expect(script).toContain('PlayResY: 1080');
      expect(script).toContain('[V4+ Styles]');
      expect(script).toContain('[Events]');
      expect(script).toContain('Dialogue: 0,0:00:01.00,0:00:04.00');
      expect(script).toContain('\\pos(960,540)');
      expect(script).toContain('\\fnMontserrat');
      expect(script).toContain('\\fs72');
      expect(script).toContain('\\fad(500,500)');
      expect(script).toContain('CINEMATIC TITLE\\NSecond Line Subtitle');
    });
  });

  describe('S167 Kinetic Title Templates Library Integration', () => {
    it('contains all 5 new S167 Kinetic Title Templates in SMART_TEXT_TEMPLATES', () => {
      const ids = SMART_TEXT_TEMPLATES.map((t) => t.id);
      expect(ids).toContain('kinetic-spring-pop');
      expect(ids).toContain('minimalist-editorial-lower-third');
      expect(ids).toContain('cyber-glitch-distortion');
      expect(ids).toContain('cinematic-luminous-glow');
      expect(ids).toContain('typewriter-speech-cadence');
    });

    it('configures responsiveTiming and appropriate kinetic animations on all S167 templates', () => {
      const springPop = SMART_TEXT_TEMPLATES.find((t) => t.id === 'kinetic-spring-pop');
      expect(springPop).toBeDefined();
      expect(springPop!.compoundAnimation?.inAnimation).toBe('kinetic_pop_in');
      expect(springPop!.compoundAnimation?.inEasing).toBe('spring');
      expect(springPop!.compoundAnimation?.responsiveTiming).toBe(true);

      const editorial = SMART_TEXT_TEMPLATES.find((t) => t.id === 'minimalist-editorial-lower-third');
      expect(editorial).toBeDefined();
      expect(editorial!.compoundAnimation?.inAnimation).toBe('minimal_lower_third');
      expect(editorial!.compoundAnimation?.responsiveTiming).toBe(true);

      const glitch = SMART_TEXT_TEMPLATES.find((t) => t.id === 'cyber-glitch-distortion');
      expect(glitch).toBeDefined();
      expect(glitch!.compoundAnimation?.inAnimation).toBe('glitch_distortion');

      const glow = SMART_TEXT_TEMPLATES.find((t) => t.id === 'cinematic-luminous-glow');
      expect(glow).toBeDefined();
      expect(glow!.compoundAnimation?.inAnimation).toBe('cinematic_glow_fade');

      const typewriter = SMART_TEXT_TEMPLATES.find((t) => t.id === 'typewriter-speech-cadence');
      expect(typewriter).toBeDefined();
      expect(typewriter!.compoundAnimation?.inAnimation).toBe('typewriter_speech');
    });
  });
});
