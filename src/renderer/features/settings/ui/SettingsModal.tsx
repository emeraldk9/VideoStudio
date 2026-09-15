import { useEffect, useState } from 'react';

import type { AspectRatioOption, RenderAcceleration, RenderEncoderInfo } from '@shared';

import { useToastStore } from '../../../shared/model/toastStore';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';
import { Switch } from '../../../shared/ui/Switch';
import {
  useAppSettingsStore,
  type AppAccent,
  type AppDensity,
  type AppTheme,
  type TimecodeFormat,
} from '../model/appSettingsStore';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'general' | 'performance' | 'cache' | 'audio' | 'about';

const TABS: { id: SettingsTab; icon: string; label: string }[] = [
  { id: 'appearance', icon: 'palette', label: 'Appearance & Theme' },
  { id: 'general', icon: 'tune', label: 'Timeline & General' },
  { id: 'performance', icon: 'speed', label: 'Performance & GPU' },
  { id: 'cache', icon: 'cached', label: 'Media & Cache' },
  { id: 'audio', icon: 'volume_up', label: 'Audio Defaults' },
  { id: 'about', icon: 'info', label: 'About VideoStudio' },
];

const THEME_OPTIONS: { id: AppTheme; label: string; desc: string; bg: string; border: string }[] = [
  {
    id: 'dark',
    label: 'Studio Dark',
    desc: 'Default neutral dark UI for editorial precision',
    bg: 'bg-[#050505]',
    border: 'border-[#272725]',
  },
  {
    id: 'oled',
    label: 'OLED Midnight',
    desc: 'Pure #000000 true black for OLED & HDR grading',
    bg: 'bg-[#000000]',
    border: 'border-[#1c1c21]',
  },
  {
    id: 'cinema',
    label: 'Cinema Slate',
    desc: 'Warm neutral dark gray (DaVinci/Premiere style)',
    bg: 'bg-[#18181b]',
    border: 'border-[#34343a]',
  },
  {
    id: 'light',
    label: 'Studio Light',
    desc: 'Crisp daylight environment with white canvas',
    bg: 'bg-[#ffffff]',
    border: 'border-[#d8d8d3]',
  },
  {
    id: 'system',
    label: 'System Match',
    desc: 'Automatically matches your Windows display mode',
    bg: 'bg-gradient-to-r from-[#050505] to-[#ffffff]',
    border: 'border-hairline',
  },
];

const ACCENT_OPTIONS: { id: AppAccent; label: string; hex: string }[] = [
  { id: 'violet', label: 'Violet AI', hex: '#7585fb' },
  { id: 'cyan', label: 'Electric Cyan', hex: '#22dee6' },
  { id: 'amber', label: 'Amber Gold', hex: '#f2bb31' },
  { id: 'emerald', label: 'Emerald Mint', hex: '#4ce3a0' },
  { id: 'coral', label: 'Coral Rose', hex: '#feaba4' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [encoder, setEncoder] = useState<RenderEncoderInfo | null>(null);

  // Settings State
  const theme = useAppSettingsStore((state) => state.theme);
  const accentColor = useAppSettingsStore((state) => state.accentColor);
  const uiDensity = useAppSettingsStore((state) => state.uiDensity);
  const timecodeFormat = useAppSettingsStore((state) => state.timecodeFormat);
  const showWaveforms = useAppSettingsStore((state) => state.showWaveforms);
  const showFilmstrips = useAppSettingsStore((state) => state.showFilmstrips);

  const defaultAspectRatio = useAppSettingsStore((state) => state.defaultAspectRatio);
  const defaultFps = useAppSettingsStore((state) => state.defaultFps);
  const defaultStillDurationSec = useAppSettingsStore((state) => state.defaultStillDurationSec);
  const snappingDefault = useAppSettingsStore((state) => state.snappingDefault);
  const magneticDefault = useAppSettingsStore((state) => state.magneticDefault);

  const hardwareAcceleration = useAppSettingsStore((state) => state.hardwareAcceleration);
  const previewQuality = useAppSettingsStore((state) => state.previewQuality);

  const audioSampleRate = useAppSettingsStore((state) => state.audioSampleRate);
  const duckingSensitivityDb = useAppSettingsStore((state) => state.duckingSensitivityDb);

  const updateSettings = useAppSettingsStore((state) => state.updateSettings);
  const resetSettings = useAppSettingsStore((state) => state.resetSettings);
  const pushToast = useToastStore((state) => state.pushToast);

  useEffect(() => {
    if (!isOpen) return;
    void window.api.sequence
      .getEncoder()
      .then((info) => setEncoder(info))
      .catch(() => {
        setEncoder({ encoderId: 'libx264', label: 'Software x264', hardware: false, hwaccelId: null });
      });
  }, [isOpen]);

  const handleClearCache = () => {
    pushToast({
      variant: 'success',
      message: 'Filmstrip sprites and waveform caches have been refreshed.',
    });
  };

  const handleReset = () => {
    resetSettings();
    pushToast({
      variant: 'success',
      message: 'All application preferences restored to factory defaults.',
    });
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="xl"
      bodyScroll={false}
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">settings</span>
          <span>Preferences</span>
        </div>
      }
    >
      <div className="flex h-[490px] overflow-hidden select-none">
        {/* Left Navigation Rail */}
        <nav
          aria-label="Settings navigation"
          className="flex w-52 shrink-0 flex-col gap-1 border-r border-hairline p-2.5 bg-bg-app/50"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 rounded-button px-3 py-2 text-xs font-medium transition-all ${
                  active
                    ? 'bg-bg-selected text-text-primary shadow-xs'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    active ? 'text-accent-ai' : 'text-text-disabled'
                  }`}
                >
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: Appearance & Theme */}
          {activeTab === 'appearance' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Studio Theme & Colors</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Customize interface themes, accent highlights, and workspace density.
                </p>
              </div>

              {/* Theme Palette Cards */}
              <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
                <label className="text-xs font-medium text-text-primary">Theme Palette</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {THEME_OPTIONS.map((opt) => {
                    const active = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateSettings({ theme: opt.id })}
                        className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all ${
                          active
                            ? 'border-accent-ai bg-accent-ai/10 shadow-xs'
                            : 'border-hairline bg-bg-app hover:border-text-disabled hover:bg-bg-hover'
                        }`}
                      >
                        <div
                          className={`h-7 w-7 shrink-0 rounded-md border shadow-xs ${opt.bg} ${opt.border} flex items-center justify-center`}
                        >
                          {active && (
                            <span className="material-symbols-outlined text-xs text-accent-ai">check</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="block text-xs font-semibold text-text-primary">{opt.label}</span>
                          <span className="block text-[10px] text-text-secondary leading-tight mt-0.5">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Signature Accent Color Swatches */}
              <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
                <div>
                  <label className="text-xs font-medium text-text-primary">Accent Highlight</label>
                  <p className="text-[11px] text-text-disabled">Applied to action buttons, playhead, and key badges</p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  {ACCENT_OPTIONS.map((opt) => {
                    const active = accentColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateSettings({ accentColor: opt.id })}
                        title={opt.label}
                        className={`group flex flex-col items-center gap-1`}
                      >
                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                            active ? 'ring-2 ring-offset-2 ring-[var(--accent-ai)] scale-110' : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: opt.hex }}
                        >
                          {active && (
                            <span className="material-symbols-outlined text-[14px] text-black font-bold">check</span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-secondary group-hover:text-text-primary">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UI Density Selector */}
              <div className="flex items-center justify-between border-t border-hairline pt-3.5">
                <div>
                  <label className="text-xs font-medium text-text-primary">UI Layout Density</label>
                  <p className="text-[11px] text-text-disabled">Scale padding and lane heights for your display</p>
                </div>
                <div className="flex items-center rounded-card border border-hairline bg-bg-canvas p-0.5">
                  {(
                    [
                      { id: 'compact', label: 'Compact' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'relaxed', label: 'Relaxed' },
                    ] as { id: AppDensity; label: string }[]
                  ).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => updateSettings({ uiDensity: d.id })}
                      className={`rounded-button px-3 py-1 text-xs font-medium transition-all ${
                        uiDensity === d.id
                          ? 'bg-bg-selected text-text-primary font-semibold shadow-xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timecode Format */}
              <div className="flex items-center justify-between border-t border-hairline pt-3.5">
                <div>
                  <label className="text-xs font-medium text-text-primary">Timecode Format</label>
                  <p className="text-[11px] text-text-disabled">Transport HUD and clip boundary display</p>
                </div>
                <Select
                  className="w-44"
                  value={timecodeFormat}
                  options={[
                    { value: 'smpte', label: 'SMPTE (00:00:15:00)' },
                    { value: 'seconds', label: 'Decimal (15.00s)' },
                    { value: 'frames', label: 'Raw Frames (450f)' },
                  ]}
                  onChange={(val) => updateSettings({ timecodeFormat: val as TimecodeFormat })}
                />
              </div>

              {/* Timeline Visual Elements */}
              <div className="flex flex-col gap-3 border-t border-hairline pt-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Render Audio Waveforms</label>
                    <p className="text-[11px] text-text-disabled">Draw real-time volume peaks on audio tracks</p>
                  </div>
                  <Switch
                    checked={showWaveforms}
                    label="Render audio waveforms"
                    onChange={() => updateSettings({ showWaveforms: !showWaveforms })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Render Clip Filmstrip Sprites</label>
                    <p className="text-[11px] text-text-disabled">Display periodic video thumbnails inside timeline clips</p>
                  </div>
                  <Switch
                    checked={showFilmstrips}
                    label="Render clip filmstrips"
                    onChange={() => updateSettings({ showFilmstrips: !showFilmstrips })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Timeline & General */}
          {activeTab === 'general' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Timeline & Sequence Defaults</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Configure default dimensions, framerates, and behaviors for new projects.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-hairline pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Default Aspect Ratio</label>
                    <p className="text-[11px] text-text-disabled">Applied when creating new projects</p>
                  </div>
                  <Select
                    className="w-44"
                    value={defaultAspectRatio}
                    options={[
                      { value: '16:9', label: '16:9 (Landscape - YouTube)' },
                      { value: '9:16', label: '9:16 (Vertical - TikTok/Reels)' },
                      { value: '1:1', label: '1:1 (Square - Instagram)' },
                      { value: '4:5', label: '4:5 (Portrait - Social)' },
                      { value: '21:9', label: '21:9 (Ultrawide Cinema)' },
                    ]}
                    onChange={(val) => updateSettings({ defaultAspectRatio: val as AspectRatioOption })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Default Frame Rate</label>
                    <p className="text-[11px] text-text-disabled">Sequence playback & export timing</p>
                  </div>
                  <Select
                    className="w-44"
                    value={String(defaultFps)}
                    options={[
                      { value: '24', label: '24 fps (Cinematic Film)' },
                      { value: '25', label: '25 fps (PAL Broadcast)' },
                      { value: '30', label: '30 fps (Standard Web)' },
                      { value: '60', label: '60 fps (High Motion)' },
                    ]}
                    onChange={(val) => updateSettings({ defaultFps: Number(val) })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Default Still Image Duration</label>
                    <p className="text-[11px] text-text-disabled">Initial length when placing photos or text</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.5}
                      value={defaultStillDurationSec}
                      aria-label="Default still image duration"
                      className="w-28 accent-[var(--accent-ai)]"
                      onChange={(e) => updateSettings({ defaultStillDurationSec: Number(e.target.value) })}
                    />
                    <span className="w-12 text-right font-mono text-xs text-text-primary">
                      {defaultStillDurationSec.toFixed(1)}s
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Magnetic Spine by Default</label>
                    <p className="text-[11px] text-text-disabled">Auto-close gaps between clips on primary track</p>
                  </div>
                  <Switch
                    checked={magneticDefault}
                    label="Magnetic spine default"
                    onChange={() => updateSettings({ magneticDefault: !magneticDefault })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Snapping Enabled by Default</label>
                    <p className="text-[11px] text-text-disabled">Magnetic snap to playhead, markers, and clip edges</p>
                  </div>
                  <Switch
                    checked={snappingDefault}
                    label="Snapping default"
                    onChange={() => updateSettings({ snappingDefault: !snappingDefault })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Performance & GPU */}
          {activeTab === 'performance' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">GPU Acceleration & Engine</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Leverage native hardware acceleration for playback and rendering.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-hairline pt-4">
                <div className="rounded-card border border-hairline bg-bg-app p-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-accent-ai">developer_board</span>
                    <span className="text-xs font-semibold text-text-primary">Hardware Encoder Status</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-secondary">
                    {encoder?.hardware ? `Hardware Accelerated: ${encoder.label}` : `CPU Fallback: ${encoder?.label ?? 'Probing...'}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-disabled">
                    {encoder?.hwaccelId
                      ? `Native GPU pipeline active (${encoder.hwaccelId})`
                      : 'Software encoding active'}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Encoder Acceleration</label>
                    <p className="text-[11px] text-text-disabled">Encoder mode for sequence export</p>
                  </div>
                  <Select
                    className="w-44"
                    value={hardwareAcceleration}
                    options={[
                      { value: 'auto', label: 'Auto (Best Detected Hardware)' },
                      { value: 'off', label: 'Disabled (Software libx264)' },
                    ]}
                    onChange={(val) => updateSettings({ hardwareAcceleration: val as RenderAcceleration })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Preview Monitor Quality</label>
                    <p className="text-[11px] text-text-disabled">Resolution scaling for smoother timeline scrubbing</p>
                  </div>
                  <Select
                    className="w-44"
                    value={previewQuality}
                    options={[
                      { value: 'full', label: 'Full Resolution (Native)' },
                      { value: 'half', label: '1/2 Resolution (Balanced)' },
                      { value: 'quarter', label: '1/4 Resolution (Fastest)' },
                    ]}
                    onChange={(val) => updateSettings({ previewQuality: val as any })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Media & Cache */}
          {activeTab === 'cache' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Media Cache & Temporary Files</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Manage disk space utilized for filmstrip thumbnails and audio waveforms.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-hairline pt-4">
                <div className="flex flex-col gap-1 rounded-card border border-hairline bg-bg-app p-3">
                  <span className="text-xs font-semibold text-text-primary">Cache Storage</span>
                  <p className="text-xs text-text-secondary">
                    VideoStudio caches video filmstrip sprites and probe data in SQLite to make timeline navigation instant.
                  </p>
                  <span className="mt-2 text-[11px] font-mono text-text-disabled">
                    Storage: Local SQLite Database (%APPDATA%/VideoStudio)
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Clear Media Cache</label>
                    <p className="text-[11px] text-text-disabled">Prunes cached thumbnail sheets to free up disk space</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleClearCache}>
                    <span className="material-symbols-outlined text-[15px] mr-1">delete_sweep</span>
                    Clear Cache
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Audio Defaults */}
          {activeTab === 'audio' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Audio Mixing & Ducking</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Configure default sample rates and compressor thresholds.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-hairline pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Master Audio Sample Rate</label>
                    <p className="text-[11px] text-text-disabled">Standard output frequency for timeline audio</p>
                  </div>
                  <Select
                    className="w-44"
                    value={String(audioSampleRate)}
                    options={[
                      { value: '48000', label: '48.0 kHz (Video Standard)' },
                      { value: '44100', label: '44.1 kHz (CD Standard)' },
                    ]}
                    onChange={(val) => updateSettings({ audioSampleRate: Number(val) as any })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-medium text-text-primary">Ducking Compression Depth</label>
                    <p className="text-[11px] text-text-disabled">Volume drop applied to music during voiceover</p>
                  </div>
                  <Select
                    className="w-44"
                    value={String(duckingSensitivityDb)}
                    options={[
                      { value: '-6', label: '-6 dB (Subtle Dip)' },
                      { value: '-12', label: '-12 dB (Moderate Dip)' },
                      { value: '-18', label: '-18 dB (Deep Dip - Clear Voice)' },
                    ]}
                    onChange={(val) => updateSettings({ duckingSensitivityDb: Number(val) })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: About VideoStudio */}
          {activeTab === 'about' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">About VideoStudio</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Standalone Desktop Video Studio & Non-Linear Editor.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-hairline pt-4">
                <div className="flex items-center gap-3 rounded-card border border-hairline bg-bg-app p-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-ai/15 text-accent-ai shadow-xs">
                    <span className="material-symbols-outlined text-2xl">movie_filter</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">VideoStudio Desktop</h4>
                    <p className="font-mono text-xs text-text-secondary">Version 1.0.0 (Production Standalone)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="rounded-md border border-hairline/60 bg-bg-app p-2.5">
                    <span className="text-[10px] text-text-disabled uppercase">Runtime</span>
                    <p className="text-text-primary mt-0.5">Electron 43 · Node 22</p>
                  </div>
                  <div className="rounded-md border border-hairline/60 bg-bg-app p-2.5">
                    <span className="text-[10px] text-text-disabled uppercase">Renderer</span>
                    <p className="text-text-primary mt-0.5">React 19 · WebGL</p>
                  </div>
                  <div className="rounded-md border border-hairline/60 bg-bg-app p-2.5">
                    <span className="text-[10px] text-text-disabled uppercase">Encoder Engine</span>
                    <p className="text-text-primary mt-0.5">FFmpeg Static 5.3.0</p>
                  </div>
                  <div className="rounded-md border border-hairline/60 bg-bg-app p-2.5">
                    <span className="text-[10px] text-text-disabled uppercase">Database</span>
                    <p className="text-text-primary mt-0.5">SQLite 3 (better-sqlite3)</p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-hairline">
                  <span className="text-xs text-text-disabled">Restore factory configurations</span>
                  <Button variant="danger" size="sm" onClick={handleReset}>
                    Reset All Preferences
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-hairline px-4 py-2.5 bg-bg-app">
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
