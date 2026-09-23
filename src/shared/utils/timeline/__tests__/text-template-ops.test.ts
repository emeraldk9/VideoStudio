import { describe, it, expect } from 'vitest';
import {
  SMART_TEXT_TEMPLATES,
  calculateCompoundTextMotion,
  generateAITitleHooks,
  applyTextTemplateToClip,
  type SmartTextTemplate,
} from '../text-template-ops';
import { type SequenceClip } from '../../../types/sequence';

describe('text-template-ops', () => {
  describe('SMART_TEXT_TEMPLATES registry', () => {
    it('contains rich templates across all 5 core categories', () => {
      expect(SMART_TEXT_TEMPLATES.length).toBeGreaterThanOrEqual(15);

      const categories = new Set(SMART_TEXT_TEMPLATES.map((t) => t.category));
      expect(categories.has('titles')).toBe(true);
      expect(categories.has('social')).toBe(true);
      expect(categories.has('lower_thirds')).toBe(true);
      expect(categories.has('callouts')).toBe(true);
      expect(categories.has('kinetic')).toBe(true);
    });

    it('ensures all templates have valid fonts, colors, and layout configurations', () => {
      for (const tmpl of SMART_TEXT_TEMPLATES) {
        expect(tmpl.id).toBeTruthy();
        expect(tmpl.name).toBeTruthy();
        expect(tmpl.primaryText).toBeTruthy();
        expect(tmpl.durationSeconds).toBeGreaterThan(0);
        expect(tmpl.style.fontSizePx).toBeGreaterThan(0);
        expect(tmpl.style.colorHex).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(['single', 'stacked', 'badge_pill', 'callout_pointer', 'news_ticker', 'bordered_card']).toContain(
          tmpl.layout
        );
      }
    });
  });

  describe('calculateCompoundTextMotion', () => {
    it('falls back to standard animation when compoundAnimation is absent', () => {
      const motion = calculateCompoundTextMotion(
        {
          text: 'Hello',
          fontSizePx: 48,
          colorHex: '#ffffff',
          align: 'center',
          positionPct: { x: 0.5, y: 0.5 },
          preset: 'title',
          animation: { type: 'fade_in', durationFrames: 20 },
        },
        10,
        90,
        30
      );
      expect(motion.opacity).toBeDefined();
    });

    it('evaluates entrance inAnimation during the opening phase', () => {
      const template = SMART_TEXT_TEMPLATES.find((t) => t.id === 'yt-subscribe-bell')!;
      const textContent = {
        ...template.style,
        text: template.primaryText,
        compoundAnimation: template.compoundAnimation,
      };

      // In phase (frame 5 < 18 frames inDuration)
      const motionStart = calculateCompoundTextMotion(textContent, 5, 120, 30);
      expect(motionStart.transform).toBeDefined();
      expect(motionStart.opacity).toBeDefined();
    });

    it('evaluates loop animation during middle frames', () => {
      const template = SMART_TEXT_TEMPLATES.find((t) => t.id === 'yt-subscribe-bell')!;
      const textContent = {
        ...template.style,
        text: template.primaryText,
        compoundAnimation: template.compoundAnimation,
      };

      // Middle frame (frame 60 is well past inDuration 18 and before exit 105)
      // loopAnimation is 'heartbeat'
      const motionMid = calculateCompoundTextMotion(textContent, 60, 120, 30);
      expect(motionMid.transform).toBeDefined();
      expect(motionMid.transform).toContain('scale');
    });

    it('evaluates exit outAnimation during the closing phase', () => {
      const template = SMART_TEXT_TEMPLATES.find((t) => t.id === 'yt-subscribe-bell')!;
      const textContent = {
        ...template.style,
        text: template.primaryText,
        compoundAnimation: template.compoundAnimation,
      };

      // Exit frame (frame 115 is within the last 15 frames of 120)
      // outAnimation is 'shrink_out'
      const motionExit = calculateCompoundTextMotion(textContent, 115, 120, 30);
      expect(motionExit.transform).toContain('scale');
      expect(motionExit.opacity).toBeLessThan(1);
    });
  });

  describe('generateAITitleHooks', () => {
    it('generates 5 viral hook suggestions with badges and recommended templates', () => {
      const hooks = generateAITitleHooks('Cryptocurrency', 'viral');
      expect(hooks).toHaveLength(5);
      expect(hooks[0].title).toContain('CRYPTOCURRENCY');
      expect(hooks[0].subtitle).toBeTruthy();
      expect(hooks[0].badgeIcon).toBeTruthy();
      expect(hooks[0].recommendedTemplateId).toBeTruthy();
    });

    it('generates corporate and professional titles for executive presentations', () => {
      const hooks = generateAITitleHooks('Cloud Architecture', 'professional');
      expect(hooks).toHaveLength(5);
      expect(hooks[0].title).toContain('CLOUD ARCHITECTURE');
      expect(hooks[1].recommendedTemplateId).toBe('broadcast-news-ticker');
    });

    it('handles cinematic tones with atmospheric titles', () => {
      const hooks = generateAITitleHooks('Beyond the Horizon', 'cinematic');
      expect(hooks).toHaveLength(5);
      expect(hooks[0].recommendedTemplateId).toBe('cinematic-gold-title');
    });

    it('uses fallback when topic is empty or whitespace', () => {
      const hooks = generateAITitleHooks('   ', 'viral');
      expect(hooks).toHaveLength(5);
      expect(hooks[0].title).toContain('VIDEO CREATION');
    });
  });

  describe('applyTextTemplateToClip', () => {
    const baseClip: SequenceClip = {
      id: 'clip-1',
      sequenceId: 'seq-1',
      trackId: 'track-text-1',
      orderIndex: 0,
      sourceKind: 'text',
      outputId: null,
      storyShotId: null,
      sourceTakeId: null,
      filePath: null,
      startFrames: 0,
      durationFrames: 90,
      sourceInFrames: null,
      sourceOutFrames: null,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'My Custom Title',
      overrides: [],
      effects: {
        text: {
          text: 'Custom Title Text',
          secondaryText: 'Custom Subtitle Text',
          fontSizePx: 48,
          colorHex: '#ffffff',
          align: 'center',
          positionPct: { x: 0.5, y: 0.5 },
          preset: 'title',
        },
      },
    };

    it('preserves existing text when preserveText is true', () => {
      const template: SmartTextTemplate = SMART_TEXT_TEMPLATES[0];
      const updated = applyTextTemplateToClip(baseClip, template, true);

      expect(updated.label).toBe(template.name);
      expect(updated.effects?.text?.text).toBe('Custom Title Text');
      expect(updated.effects?.text?.secondaryText).toBe('Custom Subtitle Text');
      expect(updated.effects?.text?.templateStyleId).toBe(template.id);
      expect(updated.effects?.text?.templateLayout).toBe(template.layout);
    });

    it('replaces text with template defaults when preserveText is false', () => {
      const template: SmartTextTemplate = SMART_TEXT_TEMPLATES[0];
      const updated = applyTextTemplateToClip(baseClip, template, false);

      expect(updated.effects?.text?.text).toBe(template.primaryText);
      expect(updated.effects?.text?.secondaryText).toBe(template.secondaryText);
      expect(updated.effects?.text?.badgeIcon).toBe(template.badgeIcon);
    });
  });
});
