import {
  DEFAULT_TEXT_BOX,
  FONT_FAMILIES,
  STUDIO_TEXT_PRESETS,
  type FontFamily,
  type FontWeight,
  type SequenceClip,
  type TextAnimationType,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Select } from '../../../../shared/ui/Select';

export interface TextInspectorTabProps {
  clip: SequenceClip;
  patchClip: (clipId: string, patch: Partial<SequenceClip>) => void;
}

export function TextInspectorTab({ clip, patchClip }: TextInspectorTabProps) {
  if (clip.sourceKind !== 'text' || !clip.effects?.text) return null;

  return (
    <>
      {/* S40: Studio Motion Title Presets */}
      <Section title="Studio Motion Presets">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(STUDIO_TEXT_PRESETS).map(([presetId, p]) => (
            <button
              key={presetId}
              type="button"
              className="flex flex-col items-start gap-0.5 rounded-lg border border-hairline/80 bg-bg-app p-2 text-left hover:border-accent-ai/70 hover:bg-bg-hover transition-all"
              onClick={() => {
                const currentText = clip.effects?.text;
                if (!currentText) return;
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    text: {
                      ...currentText,
                      fontFamily: p.fontFamily,
                      fontWeight: p.fontWeight,
                      fontSizePx: p.fontSizePx,
                      colorHex: p.colorHex,
                      letterSpacingPx: p.letterSpacingPx,
                      stroke: p.stroke,
                      shadow: p.shadow,
                      gradient: p.gradient,
                      animation: p.animation,
                      box: p.box ?? currentText.box,
                    },
                  },
                });
              }}
            >
              <span className="text-xs font-semibold text-text-primary">{p.name}</span>
              <span className="text-[10px] text-text-disabled line-clamp-1">{p.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Text & Typography">
        <textarea
          aria-label="Text content"
          defaultValue={clip.effects.text.text}
          key={clip.id}
          rows={3}
          maxLength={2000}
          className="w-full resize-y rounded-[var(--radius-button)] bg-bg-workspace p-2 text-sm text-text-primary outline-none"
          onBlur={(event) => {
            const text = event.target.value;
            if (text === clip.effects?.text?.text || !clip.effects?.text) return;
            patchClip(clip.id, {
              effects: { ...clip.effects, text: { ...clip.effects.text, text } },
            });
          }}
        />

        {/* Font Family */}
        <div className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium text-text-disabled">Font Family</span>
          <Select
            aria-label="Font family"
            value={clip.effects.text.fontFamily ?? 'Inter'}
            onChange={(val) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: { ...content, fontFamily: val as FontFamily },
                },
              });
            }}
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
            value={clip.effects.text.fontWeight ?? '700'}
            onChange={(weight) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: { ...content, fontWeight: weight as FontWeight },
                },
              });
            }}
            options={[
              { value: '400', label: 'Regular' },
              { value: '600', label: 'Semi' },
              { value: '700', label: 'Bold' },
              { value: '900', label: 'Black' },
            ]}
            ariaLabel="Font weight"
          />
        </div>

        {/* Font Size */}
        <label className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="w-16 shrink-0">Size</span>
          <input
            type="range"
            min={16}
            max={200}
            step={4}
            value={clip.effects.text.fontSizePx}
            aria-label="Font size"
            className="flex-1 accent-[var(--accent-ai)]"
            onChange={(event) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: { ...content, fontSizePx: Number(event.target.value) },
                },
              });
            }}
          />
          <span className="w-10 shrink-0 text-right font-mono">
            {clip.effects.text.fontSizePx}px
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
            value={clip.effects.text.letterSpacingPx ?? 0}
            aria-label="Letter spacing"
            className="flex-1 accent-[var(--accent-ai)]"
            onChange={(event) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: { ...content, letterSpacingPx: Number(event.target.value) },
                },
              });
            }}
          />
          <span className="w-10 shrink-0 text-right font-mono">
            {clip.effects.text.letterSpacingPx ?? 0}px
          </span>
        </label>

        {/* Text Transform */}
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="w-16 shrink-0">Case</span>
          <SegmentedControl
            value={clip.effects.text.textTransform ?? 'none'}
            onChange={(transform) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: {
                    ...content,
                    textTransform: transform as
                      | 'none'
                      | 'uppercase'
                      | 'lowercase'
                      | 'capitalize',
                  },
                },
              });
            }}
            options={[
              { value: 'none', label: 'None' },
              { value: 'uppercase', label: 'UPPER' },
              { value: 'lowercase', label: 'lower' },
              { value: 'capitalize', label: 'Title' },
            ]}
            ariaLabel="Text transform"
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
            value={clip.effects.text.positionPct.y}
            aria-label="Vertical position"
            className="flex-1 accent-[var(--accent-ai)]"
            onChange={(event) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: {
                    ...content,
                    positionPct: { ...content.positionPct, y: Number(event.target.value) },
                  },
                },
              });
            }}
          />
          <span className="w-10 shrink-0 text-right font-mono">
            {Math.round(clip.effects.text.positionPct.y * 100)}%
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
            value={clip.effects.text.positionPct.x}
            aria-label="Horizontal position"
            className="flex-1 accent-[var(--accent-ai)]"
            onChange={(event) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  text: {
                    ...content,
                    positionPct: { ...content.positionPct, x: Number(event.target.value) },
                  },
                },
              });
            }}
          />
          <span className="w-10 shrink-0 text-right font-mono">
            {Math.round(clip.effects.text.positionPct.x * 100)}%
          </span>
        </label>

        {/* Align & Anchor */}
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="w-16 shrink-0">Align</span>
          <SegmentedControl
            value={clip.effects.text.align}
            onChange={(align) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: { ...clip.effects, text: { ...content, align } },
              });
            }}
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
            value={clip.effects.text.anchor ?? 'middle'}
            onChange={(anchor) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: { ...clip.effects, text: { ...content, anchor } },
              });
            }}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'middle', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' },
            ]}
            ariaLabel="Vertical anchor"
          />
        </div>

        {/* Text Colour */}
        <label className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="w-16 shrink-0">Colour</span>
          <input
            type="color"
            value={clip.effects.text.colorHex}
            aria-label="Text colour"
            className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
            onChange={(event) => {
              const content = clip.effects?.text;
              if (!content) return;
              patchClip(clip.id, {
                effects: { ...clip.effects, text: { ...content, colorHex: event.target.value } },
              });
            }}
          />
          <span className="font-mono text-xs uppercase text-text-primary">
            {clip.effects.text.colorHex}
          </span>
        </label>

        {/* Backing Box */}
        <label className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="w-16 shrink-0">Box</span>
          <input
            type="checkbox"
            checked={Boolean(clip.effects.text.box)}
            aria-label="Backing box"
            className="accent-[var(--accent-ai)]"
            onChange={(event) => {
              const content = clip.effects?.text;
              if (!content) return;
              const box = event.target.checked ? { ...DEFAULT_TEXT_BOX } : undefined;
              patchClip(clip.id, { effects: { ...clip.effects, text: { ...content, box } } });
            }}
          />
          {clip.effects.text.box ? (
            <>
              <input
                type="color"
                value={clip.effects.text.box.colorHex}
                aria-label="Box colour"
                className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                onChange={(event) => {
                  const content = clip.effects?.text;
                  if (!content?.box) return;
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      text: { ...content, box: { ...content.box, colorHex: event.target.value } },
                    },
                  });
                }}
              />
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={clip.effects.text.box.opacity}
                aria-label="Box opacity"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(event) => {
                  const content = clip.effects?.text;
                  if (!content?.box) return;
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      text: {
                        ...content,
                        box: { ...content.box, opacity: Number(event.target.value) },
                      },
                    },
                  });
                }}
              />
            </>
          ) : null}
        </label>
      </Section>

      {/* S40: Stroke / Outline */}
      <Section title="Stroke / Outline">
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Outline</span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={clip.effects.text.stroke?.widthPx ?? 0}
              aria-label="Stroke width"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                const widthPx = Number(event.target.value);
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    text: {
                      ...content,
                      stroke:
                        widthPx > 0
                          ? { colorHex: content.stroke?.colorHex ?? '#000000', widthPx }
                          : undefined,
                    },
                  },
                });
              }}
            />
            <span className="w-10 shrink-0 text-right font-mono">
              {clip.effects.text.stroke?.widthPx ?? 0}px
            </span>
          </label>
          {clip.effects.text.stroke && clip.effects.text.stroke.widthPx > 0 ? (
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Color</span>
              <input
                type="color"
                value={clip.effects.text.stroke.colorHex}
                aria-label="Stroke color"
                className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                onChange={(event) => {
                  const content = clip.effects?.text;
                  if (!content?.stroke) return;
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      text: {
                        ...content,
                        stroke: { ...content.stroke, colorHex: event.target.value },
                      },
                    },
                  });
                }}
              />
              <span className="font-mono text-xs uppercase text-text-primary">
                {clip.effects.text.stroke.colorHex}
              </span>
            </label>
          ) : null}
        </div>
      </Section>

      {/* S40: Drop Shadow & Glow */}
      <Section title="Shadow & Glow">
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-16 shrink-0">Blur</span>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={clip.effects.text.shadow?.blurPx ?? 0}
              aria-label="Shadow blur"
              className="flex-1 accent-[var(--accent-ai)]"
              onChange={(event) => {
                const content = clip.effects?.text;
                if (!content) return;
                const blurPx = Number(event.target.value);
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    text: {
                      ...content,
                      shadow: {
                        colorHex: content.shadow?.colorHex ?? '#000000',
                        blurPx,
                        offsetX: content.shadow?.offsetX ?? 0,
                        offsetY: content.shadow?.offsetY ?? 2,
                        opacity: content.shadow?.opacity ?? 0.7,
                      },
                    },
                  },
                });
              }}
            />
            <span className="w-10 shrink-0 text-right font-mono">
              {clip.effects.text.shadow?.blurPx ?? 0}px
            </span>
          </label>

          {clip.effects.text.shadow &&
          (clip.effects.text.shadow.blurPx > 0 || clip.effects.text.shadow.opacity > 0) ? (
            <>
              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Offset X</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={1}
                  value={clip.effects.text.shadow.offsetX}
                  aria-label="Shadow offset X"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(event) => {
                    const content = clip.effects?.text;
                    if (!content?.shadow) return;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        text: {
                          ...content,
                          shadow: { ...content.shadow, offsetX: Number(event.target.value) },
                        },
                      },
                    });
                  }}
                />
                <span className="w-10 shrink-0 text-right font-mono">
                  {clip.effects.text.shadow.offsetX}px
                </span>
              </label>

              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Offset Y</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={1}
                  value={clip.effects.text.shadow.offsetY}
                  aria-label="Shadow offset Y"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(event) => {
                    const content = clip.effects?.text;
                    if (!content?.shadow) return;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        text: {
                          ...content,
                          shadow: { ...content.shadow, offsetY: Number(event.target.value) },
                        },
                      },
                    });
                  }}
                />
                <span className="w-10 shrink-0 text-right font-mono">
                  {clip.effects.text.shadow.offsetY}px
                </span>
              </label>

              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Opacity</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={clip.effects.text.shadow.opacity}
                  aria-label="Shadow opacity"
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(event) => {
                    const content = clip.effects?.text;
                    if (!content?.shadow) return;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        text: {
                          ...content,
                          shadow: { ...content.shadow, opacity: Number(event.target.value) },
                        },
                      },
                    });
                  }}
                />
                <span className="w-10 shrink-0 text-right font-mono">
                  {Math.round(clip.effects.text.shadow.opacity * 100)}%
                </span>
              </label>

              <label className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="w-16 shrink-0">Color</span>
                <input
                  type="color"
                  value={clip.effects.text.shadow.colorHex}
                  aria-label="Shadow color"
                  className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                  onChange={(event) => {
                    const content = clip.effects?.text;
                    if (!content?.shadow) return;
                    patchClip(clip.id, {
                      effects: {
                        ...clip.effects,
                        text: {
                          ...content,
                          shadow: { ...content.shadow, colorHex: event.target.value },
                        },
                      },
                    });
                  }}
                />
                <span className="font-mono text-xs uppercase text-text-primary">
                  {clip.effects.text.shadow.colorHex}
                </span>
              </label>
            </>
          ) : null}
        </div>
      </Section>

      {/* S40: Kinetic Entrance Motion */}
      <Section title="Kinetic Entrance Motion">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className="font-medium text-text-disabled">Animation Preset</span>
            <Select
              aria-label="Animation preset"
              value={clip.effects.text.animation?.type ?? 'none'}
              onChange={(val) => {
                const content = clip.effects?.text;
                if (!content) return;
                const animType = val as TextAnimationType;
                patchClip(clip.id, {
                  effects: {
                    ...clip.effects,
                    text: {
                      ...content,
                      animation:
                        animType === 'none'
                          ? undefined
                          : {
                              type: animType,
                              durationFrames:
                                content.animation?.durationFrames ||
                                (animType === 'typewriter' ? 45 : 24),
                            },
                    },
                  },
                });
              }}
              options={[
                { value: 'none', label: 'None (Static)' },
                { value: 'typewriter', label: 'Typewriter (Live Typing Reveal)' },
                { value: 'fade_in', label: 'Smooth Fade In' },
                { value: 'slide_up', label: 'Kinetic Slide Up' },
                { value: 'slide_down', label: 'Kinetic Slide Down' },
                { value: 'pop_scale', label: 'Pop Scale Elastic' },
                { value: 'bounce', label: 'Physics Bounce' },
                { value: 'glow_pulse', label: 'Neon Glow Pulse' },
              ]}
            />
          </div>

          {clip.effects.text.animation && clip.effects.text.animation.type !== 'none' ? (
            <label className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-16 shrink-0">Duration</span>
              <input
                type="range"
                min={6}
                max={90}
                step={1}
                value={clip.effects.text.animation.durationFrames}
                aria-label="Animation duration frames"
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(event) => {
                  const content = clip.effects?.text;
                  if (!content?.animation) return;
                  patchClip(clip.id, {
                    effects: {
                      ...clip.effects,
                      text: {
                        ...content,
                        animation: {
                          ...content.animation,
                          durationFrames: Number(event.target.value),
                        },
                      },
                    },
                  });
                }}
              />
              <span className="w-12 shrink-0 text-right font-mono">
                {clip.effects.text.animation.durationFrames}f (
                {(clip.effects.text.animation.durationFrames / 30).toFixed(1)}s)
              </span>
            </label>
          ) : null}
        </div>
      </Section>
    </>
  );
}
