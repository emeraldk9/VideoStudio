import { useState } from 'react';
import {
  DEFAULT_TEXT_BOX,
  FONT_FAMILIES,
  CAPCUT_CAPTION_PRESETS,
  applyTypographyStyleToClips,
  simulateMotionTracking,
  smoothTrajectory,
  attachClipToTrajectory,
  TTS_VOICE_PERSONAS,
  estimateSpeechDurationSeconds,
  createSpeechAudioClipForCaption,
  SMART_TEXT_TEMPLATES,
  applyTextTemplateToClip,
  type CompoundTextAnimationSettings,
  type FontFamily,
  type FontWeight,
  type MotionSimulationType,
  type MotionTrackingTrajectory,
  type SequenceClip,
  type TextAnimationType,
  type TextContent,
  type TTSVoicePersonaId,
} from '@shared';
import { useSequenceStore } from '../../../../entities/sequence';
import { Section } from '../../../../shared/ui/Section';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Select } from '../../../../shared/ui/Select';
import { Button } from '../../../../shared/ui/Button';

export interface TextInspectorTabProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

type TextSubTab = 'basic' | 'effects' | 'animation' | 'tracking' | 'tts';

export function TextInspectorTab({ clip, patchClip }: TextInspectorTabProps) {
  const [subTab, setSubTab] = useState<TextSubTab>('basic');
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);

  // Tracking state
  const [trackingPreset, setTrackingPreset] = useState<MotionSimulationType>('wandering_subject');
  const [trackingOffsetX, setTrackingOffsetX] = useState(0);
  const [trackingOffsetY, setTrackingOffsetY] = useState(-0.12);
  const [trackingSmoothing, setTrackingSmoothing] = useState(0.35);

  // TTS state
  const [selectedPersonaId, setSelectedPersonaId] = useState<TTSVoicePersonaId>('narrator_epic');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(0);
  const [autoMatchDuration, setAutoMatchDuration] = useState(true);
  const [ttsFeedback, setTtsFeedback] = useState<string | null>(null);

  const document = useSequenceStore((state) => state.document);
  const commitClips = useSequenceStore((state) => state.commitClips);
  const fps = document?.sequence.fps ?? 30;

  if (clip.sourceKind !== 'text' || !clip.effects?.text) return null;
  const effectsText = clip.effects.text;

  // Handle "Apply to All Captions"
  const handleApplyToAllCaptions = () => {
    if (!document) return;
    const stylePatch: Partial<TextContent> = {
      fontFamily: effectsText.fontFamily,
      fontWeight: effectsText.fontWeight,
      fontSizePx: effectsText.fontSizePx,
      colorHex: effectsText.colorHex,
      align: effectsText.align,
      anchor: effectsText.anchor,
      positionPct: effectsText.positionPct,
      letterSpacingPx: effectsText.letterSpacingPx,
      lineHeight: effectsText.lineHeight,
      textTransform: effectsText.textTransform,
      italic: effectsText.italic,
      underline: effectsText.underline,
      box: effectsText.box,
      stroke: effectsText.stroke,
      shadow: effectsText.shadow,
      glow: effectsText.glow,
      gradient: effectsText.gradient,
      animation: effectsText.animation,
    };

    const result = applyTypographyStyleToClips(document.clips, stylePatch, clip.trackId);
    commitClips(result.clips);
    setApplyFeedback(`Applied to ${result.updatedCount} captions`);
    setTimeout(() => setApplyFeedback(null), 2500);
  };

  // Helper to patch text effects
  const updateText = (patch: Partial<TextContent>) => {
    patchClip(clip.id, {
      effects: {
        ...clip.effects,
        text: {
          ...effectsText,
          ...patch,
        },
      },
    });
  };

  // Handle Motion Tracking Attachment
  const handleAttachTracking = () => {
    const rawPoints = simulateMotionTracking(
      { x: effectsText.positionPct.x, y: effectsText.positionPct.y },
      trackingPreset,
      clip.durationFrames,
    );
    const smoothedPoints = smoothTrajectory(rawPoints, trackingSmoothing);
    const trajectory: MotionTrackingTrajectory = {
      id: `track-${clip.id}`,
      name: `Track for ${clip.id}`,
      sourceClipId: clip.id,
      startFrame: 0,
      points: smoothedPoints,
      smoothed: true,
      averageConfidence: 0.95,
    };

    const pinnedClip = attachClipToTrajectory(clip, trajectory, {
      x: trackingOffsetX,
      y: trackingOffsetY,
    });
    patchClip(clip.id, { keyframes: pinnedClip.keyframes });
    setApplyFeedback('Motion Track Attached');
    setTimeout(() => setApplyFeedback(null), 2000);
  };

  const handleClearTracking = () => {
    const nonPosKeys = (clip.keyframes ?? []).filter(
      (k) => k.property !== 'x' && k.property !== 'y',
    );
    patchClip(clip.id, { keyframes: nonPosKeys.length > 0 ? nonPosKeys : undefined });
    setApplyFeedback('Tracking Cleared');
    setTimeout(() => setApplyFeedback(null), 2000);
  };

  // Handle Preview Audio Sample
  const handlePreviewVoiceSample = (personaId: TTSVoicePersonaId) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const persona = TTS_VOICE_PERSONAS[personaId];
    const textToSpeak = effectsText.text.trim() || persona.description;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = persona.defaultRate * speechRate;
    utterance.pitch = Math.max(0.5, Math.min(2.0, Math.pow(2, (persona.defaultPitch + speechPitch) / 12)));
    window.speechSynthesis.speak(utterance);
  };

  // Handle Generate Voiceover Audio Clip
  const handleGenerateVoiceover = () => {
    if (!document) return;
    const persona = TTS_VOICE_PERSONAS[selectedPersonaId];
    const estimatedSecs = estimateSpeechDurationSeconds(effectsText.text, persona.defaultRate * speechRate);
    const speechFrames = Math.max(15, Math.round(estimatedSecs * fps));

    const audioTrack = document.tracks.find((t) => t.kind === 'audio') ?? document.tracks[0];
    const synthUri = `tts://${selectedPersonaId}/${encodeURIComponent(effectsText.text.slice(0, 30))}.wav`;

    const speechClip = createSpeechAudioClipForCaption(
      clip,
      synthUri,
      speechFrames,
      audioTrack.id,
      persona.name,
    );

    const updatedClips = document.clips.map((c) => {
      if (c.id === clip.id && autoMatchDuration) {
        return { ...c, durationFrames: speechFrames };
      }
      return c;
    });

    commitClips([...updatedClips, speechClip]);
    setTtsFeedback(`Voiceover generated (${(speechFrames / fps).toFixed(1)}s)`);
    setTimeout(() => setTtsFeedback(null), 3000);
  };

  const isLongLine = effectsText.text.split('\n').some((line) => line.length > 37);
  const positionKeyframesCount = (clip.keyframes ?? []).filter(
    (k) => k.property === 'x' || k.property === 'y',
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Top Action Bar: Apply to All & Quick Presets */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-bg-app p-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-text-primary">Closed Caption & Style</span>
          <span className="text-[10px] text-text-secondary">
            {clip.effects.text.preset === 'caption' ? 'Subtitle Track Cue' : 'Rich Text Title'}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleApplyToAllCaptions}
          title="Apply this font, style, effects and animation to all captions on this track"
        >
          <span className="material-symbols-outlined text-sm text-accent-ai">done_all</span>
          <span>{applyFeedback ?? 'Apply to All'}</span>
        </Button>
      </div>

      {/* CapCut Sub-Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-hairline/80 pb-1.5 select-none overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setSubTab('basic')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-button px-2 py-1.5 text-xs font-medium transition-all ${
            subTab === 'basic'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">format_shapes</span>
          <span>Basic</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('effects')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-button px-2 py-1.5 text-xs font-medium transition-all ${
            subTab === 'effects'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">palette</span>
          <span>Effects</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('animation')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-button px-2 py-1.5 text-xs font-medium transition-all ${
            subTab === 'animation'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">animation</span>
          <span>Motion</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('tracking')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-button px-2 py-1.5 text-xs font-medium transition-all ${
            subTab === 'tracking'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">motion_mode</span>
          <span>Tracking</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('tts')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-button px-2 py-1.5 text-xs font-medium transition-all ${
            subTab === 'tts'
              ? 'bg-bg-selected text-text-primary font-semibold shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">record_voice_over</span>
          <span>TTS Voice</span>
        </button>
      </div>

      {/* Quick Preset Cards Carousel */}
      <Section title="Quick Caption Presets">
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(CAPCUT_CAPTION_PRESETS).map(([id, p]) => (
            <button
              key={id}
              type="button"
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-hairline/70 bg-bg-app p-1.5 text-center hover:border-accent-ai/70 hover:bg-bg-hover transition-all"
              onClick={() => {
                updateText({
                  ...p.effects,
                  box: (p.effects.box as TextContent['box']) ?? effectsText.box,
                });
              }}
              title={p.description}
            >
              <span className="text-[11px] font-semibold text-text-primary line-clamp-1">
                {p.name}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-text-disabled">
                {p.category}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* SUB-TAB 1: BASIC (TYPOGRAPHY & LAYOUT) */}
      {subTab === 'basic' && (
        <>
          <Section title="Smart Motion Template">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1 text-xs text-text-secondary">
                <span className="font-medium text-text-disabled">Apply Template Style</span>
                <Select
                  aria-label="Smart text template"
                  value={effectsText.templateStyleId ?? ''}
                  onChange={(templateId) => {
                    if (!templateId) return;
                    const tmpl = SMART_TEXT_TEMPLATES.find((t) => t.id === templateId);
                    if (tmpl) {
                      const updated = applyTextTemplateToClip(clip, tmpl, true);
                      patchClip(clip.id, {
                        label: updated.label,
                        effects: updated.effects,
                      });
                    }
                  }}
                  options={[
                    { value: '', label: 'Custom / Standard Text' },
                    ...SMART_TEXT_TEMPLATES.map((t) => ({
                      value: t.id,
                      label: `[${t.categoryLabel}] ${t.name}`,
                    })),
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section title="Caption Text & Content">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-text-disabled">Primary Text</span>
                <textarea
                  aria-label="Text content"
                  defaultValue={effectsText.text}
                  key={clip.id}
                  rows={2}
                  maxLength={2000}
                  className="w-full resize-y rounded-[var(--radius-button)] bg-bg-workspace p-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent-ai"
                  onBlur={(event) => {
                    const text = event.target.value;
                    if (text === effectsText.text) return;
                    updateText({ text });
                  }}
                />
                <div className="flex items-center justify-between text-[11px] text-text-disabled">
                  <span>{effectsText.text.length} characters</span>
                  {isLongLine && (
                    <span className="flex items-center gap-1 text-accent-warning font-medium">
                      <span className="material-symbols-outlined text-xs">warning</span>
                      Line &gt; 37 CPL
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-text-disabled">
                  Secondary Subtitle / Handle (Optional)
                </span>
                <input
                  type="text"
                  placeholder="e.g. Subtitle, executive title, @handle, or quote author..."
                  defaultValue={effectsText.secondaryText ?? ''}
                  key={`sec-${clip.id}`}
                  className="w-full rounded-[var(--radius-button)] bg-bg-workspace px-2.5 py-1.5 text-xs text-text-primary outline-none focus:ring-1 focus:ring-accent-ai"
                  onBlur={(event) => {
                    const val = event.target.value.trim();
                    updateText({ secondaryText: val || undefined });
                  }}
                />
              </div>

              <div className="flex flex-col gap-1 text-xs text-text-secondary">
                <span className="font-medium text-text-disabled">Badge Icon</span>
                <Select
                  aria-label="Badge icon"
                  value={effectsText.badgeIcon ?? ''}
                  onChange={(icon) => updateText({ badgeIcon: icon || undefined })}
                  options={[
                    { value: '', label: 'None' },
                    { value: 'notifications_active', label: '🔔 Bell Notification' },
                    { value: 'alternate_email', label: '📧 Social Handle @' },
                    { value: 'trending_up', label: '📈 Trending Up' },
                    { value: 'thumb_up', label: '👍 Like / Thumbs Up' },
                    { value: 'location_on', label: '📍 Location Pin' },
                    { value: 'terminal', label: '💻 Code Terminal' },
                    { value: 'campaign', label: '📢 Breaking News Banner' },
                    { value: 'verified', label: '🛡️ Verified Badge' },
                    { value: 'sell', label: '🏷️ Price Tag' },
                    { value: 'warning', label: '⚠️ Caution Warning' },
                    { value: 'help', label: '❓ Question Mark' },
                    { value: 'format_quote', label: '💬 Quotation Mark' },
                    { value: 'bolt', label: '⚡ Energy Bolt' },
                    { value: 'movie', label: '🎬 Cinema Film' },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section title="Font & Style">
            {/* Font Family */}
            <div className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className="font-medium text-text-disabled">Font Family</span>
              <Select
                aria-label="Font family"
                value={effectsText.fontFamily ?? 'Inter'}
                onChange={(val) => updateText({ fontFamily: val as FontFamily })}
                options={FONT_FAMILIES.map((f) => ({
                  value: f.family,
                  label: `${f.label} (${f.category})`,
                }))}
              />
            </div>

            {/* Font Weight */}
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Weight</span>
              <SegmentedControl
                value={effectsText.fontWeight ?? '700'}
                onChange={(weight) => updateText({ fontWeight: weight as FontWeight })}
                options={[
                  { value: '400', label: 'Regular' },
                  { value: '600', label: 'Semi' },
                  { value: '700', label: 'Bold' },
                  { value: '900', label: 'Black' },
                ]}
                ariaLabel="Font weight"
              />
            </div>

            {/* Italic & Underline & Case */}
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Format</span>
              <div className="flex items-center gap-1.5 flex-1">
                <button
                  type="button"
                  onClick={() => updateText({ italic: !effectsText.italic })}
                  className={`h-7 w-8 rounded border text-xs font-serif italic transition-all ${
                    effectsText.italic
                      ? 'border-accent-ai bg-accent-ai/20 text-accent-ai font-bold'
                      : 'border-hairline bg-bg-app text-text-secondary hover:text-text-primary'
                  }`}
                  title="Italic"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => updateText({ underline: !effectsText.underline })}
                  className={`h-7 w-8 rounded border text-xs underline transition-all ${
                    effectsText.underline
                      ? 'border-accent-ai bg-accent-ai/20 text-accent-ai font-bold'
                      : 'border-hairline bg-bg-app text-text-secondary hover:text-text-primary'
                  }`}
                  title="Underline"
                >
                  U
                </button>
                <div className="flex-1">
                  <SegmentedControl
                    value={effectsText.textTransform ?? 'none'}
                    onChange={(transform) =>
                      updateText({
                        textTransform: transform as 'none' | 'uppercase' | 'lowercase' | 'capitalize',
                      })
                    }
                    options={[
                      { value: 'none', label: 'Aa' },
                      { value: 'uppercase', label: 'AA' },
                      { value: 'lowercase', label: 'aa' },
                      { value: 'capitalize', label: 'A a' },
                    ]}
                    ariaLabel="Text transform"
                  />
                </div>
              </div>
            </div>

            {/* Font Size */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Size</span>
              <input
                type="range"
                min={16}
                max={200}
                step={2}
                value={effectsText.fontSizePx}
                aria-label="Font size"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => updateText({ fontSizePx: Number(e.target.value) })}
              />
              <span className="w-10 shrink-0 text-right font-mono">{effectsText.fontSizePx}px</span>
            </label>

            {/* Text Color */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Color</span>
              <input
                type="color"
                value={effectsText.colorHex}
                aria-label="Text colour"
                className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                onChange={(e) => updateText({ colorHex: e.target.value })}
              />
              <span className="font-mono text-xs uppercase text-text-primary">
                {effectsText.colorHex}
              </span>
            </label>

            {/* Letter Spacing */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Spacing</span>
              <input
                type="range"
                min={-2}
                max={20}
                step={1}
                value={effectsText.letterSpacingPx ?? 0}
                aria-label="Letter spacing"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => updateText({ letterSpacingPx: Number(e.target.value) })}
              />
              <span className="w-10 shrink-0 text-right font-mono">
                {effectsText.letterSpacingPx ?? 0}px
              </span>
            </label>

            {/* Line Height */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Line Spacing</span>
              <input
                type="range"
                min={0.8}
                max={2.5}
                step={0.1}
                value={effectsText.lineHeight ?? 1.2}
                aria-label="Line height"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => updateText({ lineHeight: Number(e.target.value) })}
              />
              <span className="w-10 shrink-0 text-right font-mono">
                {(effectsText.lineHeight ?? 1.2).toFixed(1)}x
              </span>
            </label>
          </Section>

          <Section title="Position & Alignment">
            {/* Align & Anchor */}
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Align</span>
              <SegmentedControl
                value={effectsText.align}
                onChange={(align) => updateText({ align })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Centre' },
                  { value: 'right', label: 'Right' },
                ]}
                ariaLabel="Text alignment"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Anchor</span>
              <SegmentedControl
                value={effectsText.anchor ?? 'middle'}
                onChange={(anchor) => updateText({ anchor })}
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'middle', label: 'Middle' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
                ariaLabel="Vertical anchor"
              />
            </div>

            {/* Vertical Position */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Vertical</span>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={effectsText.positionPct.y}
                aria-label="Vertical position"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) =>
                  updateText({
                    positionPct: { ...effectsText.positionPct, y: Number(e.target.value) },
                  })
                }
              />
              <span className="w-10 shrink-0 text-right font-mono">
                {Math.round(effectsText.positionPct.y * 100)}%
              </span>
            </label>

            {/* Horizontal Position */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Horizontal</span>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={effectsText.positionPct.x}
                aria-label="Horizontal position"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) =>
                  updateText({
                    positionPct: { ...effectsText.positionPct, x: Number(e.target.value) },
                  })
                }
              />
              <span className="w-10 shrink-0 text-right font-mono">
                {Math.round(effectsText.positionPct.x * 100)}%
              </span>
            </label>
          </Section>

          {/* Backing Box / Rounded Pill */}
          <Section title="Backing Box / Capsule Pill">
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Enable</span>
                <input
                  type="checkbox"
                  checked={Boolean(effectsText.box)}
                  aria-label="Backing box"
                  className="accent-[var(--accent-ai)]"
                  onChange={(e) => {
                    const box = e.target.checked ? { ...DEFAULT_TEXT_BOX } : undefined;
                    updateText({ box });
                  }}
                />
                <span className="text-xs text-text-primary">
                  {effectsText.box ? 'Rounded Capsule Active' : 'Off'}
                </span>
              </label>

              {effectsText.box && (
                <>
                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Color</span>
                    <input
                      type="color"
                      value={effectsText.box.colorHex}
                      aria-label="Box colour"
                      className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                      onChange={(e) =>
                        updateText({
                          box: { ...effectsText.box!, colorHex: e.target.value },
                        })
                      }
                    />
                    <span className="font-mono text-xs uppercase text-text-primary">
                      {effectsText.box.colorHex}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Opacity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={effectsText.box.opacity}
                      aria-label="Box opacity"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          box: { ...effectsText.box!, opacity: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {Math.round(effectsText.box.opacity * 100)}%
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Padding</span>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      step={2}
                      value={effectsText.box.paddingPx}
                      aria-label="Box padding"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          box: { ...effectsText.box!, paddingPx: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {effectsText.box.paddingPx}px
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Pill Radius</span>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={effectsText.box.borderRadiusPx ?? 6}
                      aria-label="Corner radius"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          box: { ...effectsText.box!, borderRadiusPx: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {effectsText.box.borderRadiusPx ?? 6}px
                    </span>
                  </label>
                </>
              )}
            </div>
          </Section>
        </>
      )}

      {/* SUB-TAB 2: EFFECTS & ART (OUTLINE, GLOW, SHADOW, GRADIENT) */}
      {subTab === 'effects' && (
        <>
          {/* Stroke / Outline */}
          <Section title="Stroke / Outline">
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Width</span>
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={effectsText.stroke?.widthPx ?? 0}
                  aria-label="Stroke width"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(e) => {
                    const widthPx = Number(e.target.value);
                    updateText({
                      stroke:
                        widthPx > 0
                          ? { colorHex: effectsText.stroke?.colorHex ?? '#000000', widthPx }
                          : undefined,
                    });
                  }}
                />
                <span className="w-10 shrink-0 text-right font-mono">
                  {effectsText.stroke?.widthPx ?? 0}px
                </span>
              </label>

              {effectsText.stroke && effectsText.stroke.widthPx > 0 && (
                <label className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="w-16 shrink-0">Color</span>
                  <input
                    type="color"
                    value={effectsText.stroke.colorHex}
                    aria-label="Stroke color"
                    className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                    onChange={(e) =>
                      updateText({
                        stroke: { ...effectsText.stroke!, colorHex: e.target.value },
                      })
                    }
                  />
                  <span className="font-mono text-xs uppercase text-text-primary">
                    {effectsText.stroke.colorHex}
                  </span>
                </label>
              )}
            </div>
          </Section>

          {/* Neon Glow */}
          <Section title="Neon Glow">
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Radius</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={effectsText.glow?.radiusPx ?? 0}
                  aria-label="Glow radius"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(e) => {
                    const radiusPx = Number(e.target.value);
                    updateText({
                      glow:
                        radiusPx > 0
                          ? {
                              colorHex: effectsText.glow?.colorHex ?? '#FFD700',
                              radiusPx,
                              intensity: effectsText.glow?.intensity ?? 0.8,
                            }
                          : undefined,
                    });
                  }}
                />
                <span className="w-10 shrink-0 text-right font-mono">
                  {effectsText.glow?.radiusPx ?? 0}px
                </span>
              </label>

              {effectsText.glow && effectsText.glow.radiusPx > 0 && (
                <>
                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Intensity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={effectsText.glow.intensity}
                      aria-label="Glow intensity"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          glow: { ...effectsText.glow!, intensity: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {Math.round(effectsText.glow.intensity * 100)}%
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Glow Color</span>
                    <input
                      type="color"
                      value={effectsText.glow.colorHex}
                      aria-label="Glow color"
                      className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                      onChange={(e) =>
                        updateText({
                          glow: { ...effectsText.glow!, colorHex: e.target.value },
                        })
                      }
                    />
                    <span className="font-mono text-xs uppercase text-text-primary">
                      {effectsText.glow.colorHex}
                    </span>
                  </label>
                </>
              )}
            </div>
          </Section>

          {/* Drop Shadow */}
          <Section title="Drop Shadow">
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Blur</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={effectsText.shadow?.blurPx ?? 0}
                  aria-label="Shadow blur"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(e) => {
                    const blurPx = Number(e.target.value);
                    updateText({
                      shadow: {
                        colorHex: effectsText.shadow?.colorHex ?? '#000000',
                        blurPx,
                        offsetX: effectsText.shadow?.offsetX ?? 0,
                        offsetY: effectsText.shadow?.offsetY ?? 2,
                        opacity: effectsText.shadow?.opacity ?? 0.7,
                      },
                    });
                  }}
                />
                <span className="w-10 shrink-0 text-right font-mono">
                  {effectsText.shadow?.blurPx ?? 0}px
                </span>
              </label>

              {effectsText.shadow && (effectsText.shadow.blurPx > 0 || effectsText.shadow.opacity > 0) && (
                <>
                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Offset X</span>
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={1}
                      value={effectsText.shadow.offsetX}
                      aria-label="Shadow offset X"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          shadow: { ...effectsText.shadow!, offsetX: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {effectsText.shadow.offsetX}px
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Offset Y</span>
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={1}
                      value={effectsText.shadow.offsetY}
                      aria-label="Shadow offset Y"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          shadow: { ...effectsText.shadow!, offsetY: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {effectsText.shadow.offsetY}px
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Opacity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={effectsText.shadow.opacity}
                      aria-label="Shadow opacity"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          shadow: { ...effectsText.shadow!, opacity: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {Math.round(effectsText.shadow.opacity * 100)}%
                    </span>
                  </label>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Color</span>
                    <input
                      type="color"
                      value={effectsText.shadow.colorHex}
                      aria-label="Shadow color"
                      className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                      onChange={(e) =>
                        updateText({
                          shadow: { ...effectsText.shadow!, colorHex: e.target.value },
                        })
                      }
                    />
                    <span className="font-mono text-xs uppercase text-text-primary">
                      {effectsText.shadow.colorHex}
                    </span>
                  </label>
                </>
              )}
            </div>
          </Section>

          {/* 2-Color Linear Gradient Fill */}
          <Section title="Gradient Fill">
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Enable</span>
                <input
                  type="checkbox"
                  checked={Boolean(effectsText.gradient?.enabled)}
                  aria-label="Gradient fill"
                  className="accent-[var(--accent-ai)]"
                  onChange={(e) => {
                    updateText({
                      gradient: e.target.checked
                        ? {
                            enabled: true,
                            fromHex: effectsText.gradient?.fromHex ?? '#FFE259',
                            toHex: effectsText.gradient?.toHex ?? '#FFA751',
                            angleDeg: 90,
                          }
                        : undefined,
                    });
                  }}
                />
                <span className="text-xs text-text-primary">
                  {effectsText.gradient?.enabled ? 'Linear Gradient Active' : 'Solid Color'}
                </span>
              </label>

              {effectsText.gradient?.enabled && (
                <>
                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    <label className="flex items-center gap-2">
                      <span>From</span>
                      <input
                        type="color"
                        value={effectsText.gradient.fromHex}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                        onChange={(e) =>
                          updateText({
                            gradient: { ...effectsText.gradient!, fromHex: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span>To</span>
                      <input
                        type="color"
                        value={effectsText.gradient.toHex}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                        onChange={(e) =>
                          updateText({
                            gradient: { ...effectsText.gradient!, toHex: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className="w-16 shrink-0">Angle</span>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={15}
                      value={effectsText.gradient.angleDeg ?? 90}
                      aria-label="Gradient angle"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) =>
                        updateText({
                          gradient: {
                            ...effectsText.gradient!,
                            angleDeg: Number(e.target.value),
                          },
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right font-mono">
                      {effectsText.gradient.angleDeg ?? 90}°
                    </span>
                  </label>
                </>
              )}
            </div>
          </Section>
        </>
      )}

      {/* SUB-TAB 3: ANIMATION (IN / OUT / LOOP / KARAOKE) */}
      {subTab === 'animation' && (
        <>
          <Section title="Compound 3-Phase Motion (In / Loop / Out)">
            <div className="flex flex-col gap-3">
              {/* Entrance (In) Animation */}
              <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-bg-app border border-hairline">
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-accent-ai">login</span>
                  Entrance (In) Animation
                </span>
                <Select
                  aria-label="Entrance animation"
                  value={effectsText.compoundAnimation?.inAnimation ?? (effectsText.animation?.type || 'none')}
                  onChange={(val) => {
                    const animType = val as TextAnimationType;
                    const prevCompound = effectsText.compoundAnimation ?? {};
                    updateText({
                      compoundAnimation: {
                        ...prevCompound,
                        inAnimation: animType === 'none' ? undefined : animType,
                        inDurationFrames: prevCompound.inDurationFrames ?? 18,
                      },
                    });
                  }}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'fade_in', label: 'Smooth Fade In' },
                    { value: 'slide_up', label: 'Kinetic Slide Up' },
                    { value: 'slide_down', label: 'Kinetic Slide Down' },
                    { value: 'slide_left', label: 'Kinetic Slide Left' },
                    { value: 'slide_right', label: 'Kinetic Slide Right' },
                    { value: 'pop_scale', label: 'Pop Scale Elastic' },
                    { value: 'zoom_in', label: 'Smooth Zoom In' },
                    { value: 'bounce', label: 'Physics Gravity Bounce' },
                    { value: 'typewriter', label: 'Typewriter Typing Reveal' },
                    { value: 'glitch', label: 'Digital Glitch Jitter' },
                    { value: 'flip_x', label: '3D Flip X Rotation' },
                    { value: 'elastic_drop', label: 'Elastic Ceiling Drop' },
                    { value: 'tracking_expand', label: 'Tracking Kerning Expansion' },
                  ]}
                />
                {effectsText.compoundAnimation?.inAnimation && effectsText.compoundAnimation.inAnimation !== 'none' && (
                  <label className="flex items-center gap-3 text-xs text-text-secondary mt-1">
                    <span className="w-16 shrink-0">Duration</span>
                    <input
                      type="range"
                      min={6}
                      max={60}
                      step={1}
                      value={effectsText.compoundAnimation.inDurationFrames ?? 18}
                      aria-label="In duration frames"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) => {
                        updateText({
                          compoundAnimation: {
                            ...effectsText.compoundAnimation!,
                            inDurationFrames: Number(e.target.value),
                          },
                        });
                      }}
                    />
                    <span className="w-12 shrink-0 text-right font-mono">
                      {effectsText.compoundAnimation.inDurationFrames ?? 18}f
                    </span>
                  </label>
                )}
              </div>

              {/* Loop / Continuous Animation */}
              <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-bg-app border border-hairline">
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-purple-400">sync</span>
                  Continuous Loop Motion
                </span>
                <Select
                  aria-label="Loop animation"
                  value={effectsText.compoundAnimation?.loopAnimation ?? 'none'}
                  onChange={(val) => {
                    const animType = val as TextAnimationType;
                    const prevCompound = effectsText.compoundAnimation ?? {};
                    updateText({
                      compoundAnimation: {
                        ...prevCompound,
                        loopAnimation: animType === 'none' ? undefined : animType,
                      },
                    });
                  }}
                  options={[
                    { value: 'none', label: 'None (Steady)' },
                    { value: 'heartbeat', label: 'Pulsing Heartbeat' },
                    { value: 'glow_pulse', label: 'Neon Glow Pulse' },
                    { value: 'wave', label: 'Smooth Sine Wave' },
                    { value: 'shimmer', label: 'Luminous Shimmer' },
                    { value: 'bounce_loop', label: 'Continuous Bouncing' },
                    { value: 'rainbow_cycle', label: 'Chromatic Rainbow Cycle' },
                    { value: 'karaoke_highlight', label: 'Word-by-Word Spoken Cadence' },
                  ]}
                />
              </div>

              {/* Exit (Out) Animation */}
              <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-bg-app border border-hairline">
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-amber-400">logout</span>
                  Exit (Out) Animation
                </span>
                <Select
                  aria-label="Exit animation"
                  value={effectsText.compoundAnimation?.outAnimation ?? 'none'}
                  onChange={(val) => {
                    const animType = val as TextAnimationType;
                    const prevCompound = effectsText.compoundAnimation ?? {};
                    updateText({
                      compoundAnimation: {
                        ...prevCompound,
                        outAnimation: animType === 'none' ? undefined : animType,
                        outDurationFrames: prevCompound.outDurationFrames ?? 15,
                      },
                    });
                  }}
                  options={[
                    { value: 'none', label: 'None (Cut)' },
                    { value: 'fade_out', label: 'Smooth Fade Out' },
                    { value: 'slide_down_out', label: 'Slide Down & Out' },
                    { value: 'zoom_out', label: 'Smooth Zoom Out' },
                    { value: 'dissolve', label: 'Quadratic Dissolve' },
                    { value: 'shrink_out', label: 'Elastic Shrink Out' },
                    { value: 'wipe_right', label: 'Linear Wipe Right' },
                  ]}
                />
                {effectsText.compoundAnimation?.outAnimation && effectsText.compoundAnimation.outAnimation !== 'none' && (
                  <label className="flex items-center gap-3 text-xs text-text-secondary mt-1">
                    <span className="w-16 shrink-0">Duration</span>
                    <input
                      type="range"
                      min={6}
                      max={60}
                      step={1}
                      value={effectsText.compoundAnimation.outDurationFrames ?? 15}
                      aria-label="Out duration frames"
                      className="flex-1 accent-[var(--accent-ai)]"
                      onChange={(e) => {
                        updateText({
                          compoundAnimation: {
                            ...effectsText.compoundAnimation!,
                            outDurationFrames: Number(e.target.value),
                          },
                        });
                      }}
                    />
                    <span className="w-12 shrink-0 text-right font-mono">
                      {effectsText.compoundAnimation.outDurationFrames ?? 15}f
                    </span>
                  </label>
                )}
              </div>
            </div>
          </Section>
        </>
      )}

      {/* SUB-TAB 4: TRACKING (SUBJECT FOLLOWER & CAMERA DRIFT) */}
      {subTab === 'tracking' && (
        <Section title="Motion Tracking & Pinning">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className="font-medium text-text-disabled">Tracking Motion Preset</span>
              <Select
                aria-label="Tracking motion preset"
                value={trackingPreset}
                onChange={(val) => setTrackingPreset(val as MotionSimulationType)}
                options={[
                  { value: 'wandering_subject', label: 'Wandering Subject (Natural Human Walk)' },
                  { value: 'parabolic_arc', label: 'Parabolic Arc (Action / Jump Arc)' },
                  { value: 'orbital_circle', label: 'Orbital Drift (Rotating Perspective)' },
                  { value: 'linear_pan', label: 'Linear Pan (Steady Horizontal Sweep)' },
                ]}
              />
            </div>

            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Offset X</span>
              <input
                type="range"
                min={-0.4}
                max={0.4}
                step={0.01}
                value={trackingOffsetX}
                aria-label="Offset X"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => setTrackingOffsetX(Number(e.target.value))}
              />
              <span className="w-12 shrink-0 text-right font-mono">
                {Math.round(trackingOffsetX * 100)}%
              </span>
            </label>

            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Offset Y</span>
              <input
                type="range"
                min={-0.4}
                max={0.4}
                step={0.01}
                value={trackingOffsetY}
                aria-label="Offset Y"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => setTrackingOffsetY(Number(e.target.value))}
              />
              <span className="w-12 shrink-0 text-right font-mono">
                {Math.round(trackingOffsetY * 100)}%
              </span>
            </label>

            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Smoothing</span>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.05}
                value={trackingSmoothing}
                aria-label="Smoothing alpha"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => setTrackingSmoothing(Number(e.target.value))}
              />
              <span className="w-12 shrink-0 text-right font-mono">
                {Math.round((1 - trackingSmoothing) * 100)}%
              </span>
            </label>

            <div className="flex items-center justify-between text-[11px] text-text-disabled">
              <span>Status:</span>
              <span className="font-mono text-accent-ai">
                {positionKeyframesCount > 0
                  ? `${positionKeyframesCount} active tracking keyframes`
                  : 'Static (No tracking)'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={handleAttachTracking}
              >
                <span className="material-symbols-outlined text-sm">motion_mode</span>
                Pin to Motion Track
              </Button>
              {positionKeyframesCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearTracking}
                  title="Remove motion tracking keyframes"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* SUB-TAB 5: TEXT-TO-SPEECH (TTS AI VOICEOVER) */}
      {subTab === 'tts' && (
        <Section title="AI Voiceover Generator">
          <div className="flex flex-col gap-3">
            {/* Voice Personas Grid */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TTS_VOICE_PERSONAS).map(([id, p]) => (
                <div
                  key={id}
                  className={`flex flex-col gap-1 rounded-lg border p-2 text-left transition-all cursor-pointer ${
                    selectedPersonaId === id
                      ? 'border-accent-ai bg-accent-ai/10 shadow-sm'
                      : 'border-hairline/80 bg-bg-app hover:border-hairline hover:bg-bg-hover'
                  }`}
                  onClick={() => setSelectedPersonaId(id as TTSVoicePersonaId)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary">{p.name}</span>
                    <button
                      type="button"
                      aria-label={`Preview sample of ${p.name}`}
                      className="text-text-secondary hover:text-accent-ai"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreviewVoiceSample(id as TTSVoicePersonaId);
                      }}
                      title="Play voice sample"
                    >
                      <span className="material-symbols-outlined text-base">volume_up</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-text-disabled line-clamp-2">
                    {p.description}
                  </span>
                </div>
              ))}
            </div>

            {/* Rate & Pitch Controls */}
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Speed</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={speechRate}
                aria-label="Speech speed"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => setSpeechRate(Number(e.target.value))}
              />
              <span className="w-12 shrink-0 text-right font-mono">
                {speechRate.toFixed(2)}x
              </span>
            </label>

            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Pitch</span>
              <input
                type="range"
                min={-6}
                max={6}
                step={1}
                value={speechPitch}
                aria-label="Speech pitch"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(e) => setSpeechPitch(Number(e.target.value))}
              />
              <span className="w-12 shrink-0 text-right font-mono">
                {speechPitch > 0 ? `+${speechPitch}` : speechPitch} semitones
              </span>
            </label>

            {/* Auto Match Duration Checkbox */}
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={autoMatchDuration}
                aria-label="Auto-match caption duration"
                className="accent-[var(--accent-ai)]"
                onChange={(e) => setAutoMatchDuration(e.target.checked)}
              />
              <span>Auto-match caption length to voiceover duration</span>
            </label>

            {/* Est Duration Info */}
            <div className="flex items-center justify-between text-[11px] text-text-disabled">
              <span>Estimated Voice Length:</span>
              <span className="font-mono text-text-primary">
                {estimateSpeechDurationSeconds(
                  effectsText.text,
                  TTS_VOICE_PERSONAS[selectedPersonaId].defaultRate * speechRate,
                ).toFixed(1)}
                s (~
                {Math.round(
                  estimateSpeechDurationSeconds(
                    effectsText.text,
                    TTS_VOICE_PERSONAS[selectedPersonaId].defaultRate * speechRate,
                  ) * fps,
                )}{' '}
                frames)
              </span>
            </div>

            {/* Generate Action Button */}
            <div className="flex flex-col gap-1.5 pt-1">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={handleGenerateVoiceover}
              >
                <span className="material-symbols-outlined text-sm">record_voice_over</span>
                Generate Voiceover Audio
              </Button>
              {ttsFeedback && (
                <div className="flex items-center justify-center gap-1 text-[11px] text-accent-success font-medium">
                  <span className="material-symbols-outlined text-xs">check_circle</span>
                  <span>{ttsFeedback}</span>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
