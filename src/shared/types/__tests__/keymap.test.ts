import { describe, expect, it } from 'vitest';

import {
  ALL_NLE_PROFILES,
  CAPCUT_KEYMAP,
  FINALCUT_KEYMAP,
  findKeymapConflicts,
  formatKeyBinding,
  matchesKeyBinding,
  NLE_PROFILE_IDS,
  normalizeKey,
  PREMIERE_KEYMAP,
  RESOLVE_KEYMAP,
  resolveActionForEvent,
  TIMELINE_ACTIONS,
  VIDEOSTUDIO_KEYMAP,
  type KeyBinding,
  type TimelineActionId,
} from '../keymap';

describe('Keymap Engine & NLE Profiles', () => {
  it('registers all standard NLE profiles with metadata and bindings', () => {
    expect(NLE_PROFILE_IDS).toEqual(['videostudio', 'premiere', 'resolve', 'finalcut', 'capcut']);
    expect(Object.keys(ALL_NLE_PROFILES)).toEqual(NLE_PROFILE_IDS);

    for (const id of NLE_PROFILE_IDS) {
      const profile = ALL_NLE_PROFILES[id];
      expect(profile.id).toBe(id);
      expect(profile.name).toBeDefined();
      expect(profile.description).toBeDefined();
      expect(profile.bindings).toBeDefined();
    }
  });

  it('defines actions covering all functional categories', () => {
    expect(TIMELINE_ACTIONS.length).toBeGreaterThan(30);
    const actionIds = new Set(TIMELINE_ACTIONS.map((a) => a.id));
    expect(actionIds.has('play_pause')).toBe(true);
    expect(actionIds.has('split_at_playhead')).toBe(true);
    expect(actionIds.has('ripple_delete')).toBe(true);
    expect(actionIds.has('undo')).toBe(true);
    expect(actionIds.has('audio_gain_dialog')).toBe(true);
  });

  describe('formatKeyBinding', () => {
    it('formats single keys and spaces', () => {
      expect(formatKeyBinding({ key: ' ' })).toBe('Space');
      expect(formatKeyBinding({ key: 'a' })).toBe('A');
      expect(formatKeyBinding({ key: 'Delete' })).toBe('Delete');
      expect(formatKeyBinding({ key: 'ArrowLeft' })).toBe('ArrowLeft');
    });

    it('formats combinations with Ctrl, Alt, Shift', () => {
      expect(formatKeyBinding({ key: 'z', ctrlOrMeta: true })).toBe('Ctrl+Z');
      expect(formatKeyBinding({ key: 'z', ctrlOrMeta: true, shift: true })).toBe('Ctrl+Shift+Z');
      expect(formatKeyBinding({ key: 'g', alt: true })).toBe('Alt+G');
      expect(formatKeyBinding({ key: 'k', ctrlOrMeta: true, alt: true, shift: true })).toBe('Ctrl+Alt+Shift+K');
    });
  });

  describe('normalizeKey & matchesKeyBinding', () => {
    it('normalizes space variations and uppercase characters', () => {
      expect(normalizeKey(' ')).toBe(' ');
      expect(normalizeKey('Spacebar')).toBe(' ');
      expect(normalizeKey('A')).toBe('a');
      expect(normalizeKey('b')).toBe('b');
      expect(normalizeKey('Escape')).toBe('Escape');
    });

    it('matches KeyboardEvents with exact modifier flags', () => {
      const binding: KeyBinding = { key: 'z', ctrlOrMeta: true };

      const matchingEvent = {
        key: 'z',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      } as unknown as KeyboardEvent;

      const nonMatchingShift = {
        key: 'z',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      } as unknown as KeyboardEvent;

      const nonMatchingKey = {
        key: 'x',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      } as unknown as KeyboardEvent;

      expect(matchesKeyBinding(matchingEvent, binding)).toBe(true);
      expect(matchesKeyBinding(nonMatchingShift, binding)).toBe(false);
      expect(matchesKeyBinding(nonMatchingKey, binding)).toBe(false);
    });

    it('matches metaKey as ctrlOrMeta on macOS', () => {
      const binding: KeyBinding = { key: 'b', ctrlOrMeta: true };
      const macCmdEvent = {
        key: 'b',
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
      } as unknown as KeyboardEvent;

      expect(matchesKeyBinding(macCmdEvent, binding)).toBe(true);
    });
  });

  describe('resolveActionForEvent across NLE profiles', () => {
    it('resolves VideoStudio default actions', () => {
      const spaceEvent = { key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      const sEvent = { key: 's', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      const bEvent = { key: 'b', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      const cEvent = { key: 'c', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      const vEvent = { key: 'v', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;

      expect(resolveActionForEvent(spaceEvent, VIDEOSTUDIO_KEYMAP.bindings)).toBe('play_pause');
      expect(resolveActionForEvent(sEvent, VIDEOSTUDIO_KEYMAP.bindings)).toBe('split_at_playhead');
      expect(resolveActionForEvent(bEvent, VIDEOSTUDIO_KEYMAP.bindings)).toBe('tool_ripple');
      expect(resolveActionForEvent(cEvent, VIDEOSTUDIO_KEYMAP.bindings)).toBe('tool_split');
      expect(resolveActionForEvent(vEvent, VIDEOSTUDIO_KEYMAP.bindings)).toBe('tool_select');
    });

    it('resolves Premiere Pro razor tool and split actions', () => {
      const cEvent = { key: 'c', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      const ctrlKEvent = { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;

      expect(resolveActionForEvent(cEvent, PREMIERE_KEYMAP.bindings)).toBe('tool_split');
      expect(resolveActionForEvent(ctrlKEvent, PREMIERE_KEYMAP.bindings)).toBe('split_at_playhead');
    });

    it('resolves DaVinci Resolve blade and split actions', () => {
      const bEvent = { key: 'b', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      const ctrlBEvent = { key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;

      expect(resolveActionForEvent(bEvent, RESOLVE_KEYMAP.bindings)).toBe('tool_split');
      expect(resolveActionForEvent(ctrlBEvent, RESOLVE_KEYMAP.bindings)).toBe('split_at_playhead');
    });

    it('resolves Final Cut Pro blade command', () => {
      const ctrlBEvent = { key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      expect(resolveActionForEvent(ctrlBEvent, FINALCUT_KEYMAP.bindings)).toBe('split_at_playhead');
    });

    it('resolves CapCut split command', () => {
      const ctrlBEvent = { key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
      expect(resolveActionForEvent(ctrlBEvent, CAPCUT_KEYMAP.bindings)).toBe('split_at_playhead');
    });

    it('returns null when no binding matches', () => {
      const unmapped = { key: 'F12', ctrlKey: true, altKey: true, shiftKey: true } as unknown as KeyboardEvent;
      expect(resolveActionForEvent(unmapped, VIDEOSTUDIO_KEYMAP.bindings)).toBeNull();
    });
  });

  describe('findKeymapConflicts', () => {
    it('returns no conflicts for clean preset bindings', () => {
      const conflicts = findKeymapConflicts(VIDEOSTUDIO_KEYMAP.bindings);
      expect(conflicts).toHaveLength(0);
    });

    it('detects when multiple actions share the exact same key combination', () => {
      const mockBindings: Record<TimelineActionId, KeyBinding[]> = {
        ...VIDEOSTUDIO_KEYMAP.bindings,
        split_at_playhead: [{ key: ' ' }], // Collides with play_pause (' ')
      };

      const conflicts = findKeymapConflicts(mockBindings);
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      const conflict = conflicts.find((c) => c.keyString === 'Space');
      expect(conflict).toBeDefined();
      expect(conflict?.actionA).toBe('play_pause');
      expect(conflict?.actionB).toBe('split_at_playhead');
    });
  });
});
