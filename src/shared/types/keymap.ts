/**
 * Milestone S159 — Industry-Standard NLE Keyboard Shortcut Profiles & Keymap Engine.
 *
 * Supports configurable keyboard profiles modeled after major NLE workstations:
 * - VideoStudio Default
 * - Adobe Premiere Pro
 * - DaVinci Resolve
 * - Apple Final Cut Pro
 * - CapCut
 */

export const NLE_PROFILE_IDS = [
  'videostudio',
  'premiere',
  'resolve',
  'finalcut',
  'capcut',
] as const;
export type NleProfileId = (typeof NLE_PROFILE_IDS)[number];

export const KEYMAP_CATEGORIES = [
  'playback',
  'tools',
  'editing',
  'marking',
  'audio_fx',
  'view',
  'history',
] as const;
export type KeymapCategory = (typeof KEYMAP_CATEGORIES)[number];

export interface KeyBinding {
  /** Normalized key representation: ' ' (Space), 'a'..'z', 'ArrowLeft', 'Delete', etc. */
  key: string;
  ctrlOrMeta?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export type TimelineActionId =
  // Playback & Shuttle
  | 'play_pause'
  | 'shuttle_left'
  | 'shuttle_right'
  | 'shuttle_stop'
  | 'step_forward'
  | 'step_backward'
  | 'step_forward_second'
  | 'step_backward_second'
  | 'jump_start'
  | 'jump_end'
  | 'jump_prev_cut'
  | 'jump_next_cut'
  | 'toggle_loop'
  // Tools
  | 'tool_select'
  | 'tool_split'
  | 'tool_ripple'
  | 'tool_roll'
  | 'tool_slip'
  | 'tool_slide'
  | 'tool_select_right'
  | 'tool_select_left'
  | 'tool_escape'
  // Editing
  | 'split_at_playhead'
  | 'delete_selection'
  | 'ripple_delete'
  | 'ripple_trim_head'
  | 'ripple_trim_tail'
  | 'lift_work_area'
  | 'extract_work_area'
  | 'slip_left'
  | 'slip_right'
  | 'slip_left_large'
  | 'slip_right_large'
  // Marking
  | 'mark_in'
  | 'mark_out'
  | 'clear_in'
  | 'clear_out'
  | 'clear_in_out'
  | 'add_marker'
  | 'jump_prev_marker'
  | 'jump_next_marker'
  // Audio & FX
  | 'audio_gain_dialog'
  | 'nudge_gain_up'
  | 'nudge_gain_down'
  | 'add_adjustment_layer'
  | 'create_compound_clip'
  | 'decompose_compound_clip'
  // View
  | 'zoom_in'
  | 'zoom_out'
  | 'zoom_fit'
  | 'toggle_snapping'
  // History
  | 'undo'
  | 'redo';

export interface ActionMetadata {
  id: TimelineActionId;
  name: string;
  description: string;
  category: KeymapCategory;
}

export const TIMELINE_ACTIONS: ActionMetadata[] = [
  // Playback & Transport
  { id: 'play_pause', name: 'Play / Pause', description: 'Toggle timeline playback', category: 'playback' },
  { id: 'shuttle_left', name: 'Shuttle Reverse (J)', description: 'Jog transport backwards at increasing rate', category: 'playback' },
  { id: 'shuttle_stop', name: 'Shuttle Stop (K)', description: 'Stop transport shuttle', category: 'playback' },
  { id: 'shuttle_right', name: 'Shuttle Forward (L)', description: 'Jog transport forward at increasing rate', category: 'playback' },
  { id: 'step_backward', name: 'Step 1 Frame Backward', description: 'Move playhead 1 frame to the left', category: 'playback' },
  { id: 'step_forward', name: 'Step 1 Frame Forward', description: 'Move playhead 1 frame to the right', category: 'playback' },
  { id: 'step_backward_second', name: 'Step 1 Second Backward', description: 'Move playhead 1 second to the left', category: 'playback' },
  { id: 'step_forward_second', name: 'Step 1 Second Forward', description: 'Move playhead 1 second to the right', category: 'playback' },
  { id: 'jump_start', name: 'Jump to Sequence Start', description: 'Move playhead to start of timeline or In-point', category: 'playback' },
  { id: 'jump_end', name: 'Jump to Sequence End', description: 'Move playhead to end of timeline or Out-point', category: 'playback' },
  { id: 'jump_prev_cut', name: 'Jump to Previous Edit Cut', description: 'Move playhead to preceding cut boundary or marker', category: 'playback' },
  { id: 'jump_next_cut', name: 'Jump to Next Edit Cut', description: 'Move playhead to succeeding cut boundary or marker', category: 'playback' },
  { id: 'toggle_loop', name: 'Toggle Loop Playback', description: 'Enable or disable playback looping', category: 'playback' },

  // Tools
  { id: 'tool_select', name: 'Selection Tool', description: 'Standard pointer tool for moving and selecting clips', category: 'tools' },
  { id: 'tool_split', name: 'Razor / Blade Tool', description: 'Click on a clip to split at the pointer frame', category: 'tools' },
  { id: 'tool_ripple', name: 'Ripple Edit Tool', description: 'Trim clip while rippling adjacent downstream clips', category: 'tools' },
  { id: 'tool_roll', name: 'Rolling Edit Tool', description: 'Roll edit boundary between two adjacent clips', category: 'tools' },
  { id: 'tool_slip', name: 'Slip Edit Tool (Y)', description: 'Adjust source in/out points while keeping clip duration and timeline position fixed', category: 'tools' },
  { id: 'tool_slide', name: 'Slide Edit Tool (U)', description: 'Slide clip along timeline while rippling adjacent clips to maintain total sequence duration', category: 'tools' },
  { id: 'tool_select_right', name: 'Track Select Forward', description: 'Select all clips to the right of cursor', category: 'tools' },
  { id: 'tool_select_left', name: 'Track Select Backward', description: 'Select all clips to the left of cursor', category: 'tools' },
  { id: 'tool_escape', name: 'Escape / Clear Selection', description: 'Clear active selection and reset to Selection tool', category: 'tools' },

  // Editing
  { id: 'split_at_playhead', name: 'Split / Add Edit at Playhead', description: 'Slice clips at current playhead position', category: 'editing' },
  { id: 'delete_selection', name: 'Delete Selection (Leaves Gap)', description: 'Remove selected clips without rippling timeline', category: 'editing' },
  { id: 'ripple_delete', name: 'Ripple Delete', description: 'Remove selected clips and close the resulting gap', category: 'editing' },
  { id: 'ripple_trim_head', name: 'Ripple Trim Head to Playhead', description: 'Trim clip start to playhead and ripple timeline', category: 'editing' },
  { id: 'ripple_trim_tail', name: 'Ripple Trim Tail to Playhead', description: 'Trim clip end to playhead and ripple timeline', category: 'editing' },
  { id: 'lift_work_area', name: 'Lift Work Area', description: 'Remove In-to-Out work area leaving a gap', category: 'editing' },
  { id: 'extract_work_area', name: 'Extract Work Area', description: 'Remove In-to-Out work area and ripple timeline backward', category: 'editing' },
  { id: 'slip_left', name: 'Slip Media 1 Frame Left', description: 'Shift inner media content left within trim window', category: 'editing' },
  { id: 'slip_right', name: 'Slip Media 1 Frame Right', description: 'Shift inner media content right within trim window', category: 'editing' },
  { id: 'slip_left_large', name: 'Slip Media 10 Frames Left', description: 'Shift inner media content 10 frames left', category: 'editing' },
  { id: 'slip_right_large', name: 'Slip Media 10 Frames Right', description: 'Shift inner media content 10 frames right', category: 'editing' },

  // Marking
  { id: 'mark_in', name: 'Mark In Point', description: 'Set Work Area In-point or trim clip start', category: 'marking' },
  { id: 'mark_out', name: 'Mark Out Point', description: 'Set Work Area Out-point or trim clip end', category: 'marking' },
  { id: 'clear_in', name: 'Clear In Point', description: 'Remove Work Area In-point boundary', category: 'marking' },
  { id: 'clear_out', name: 'Clear Out Point', description: 'Remove Work Area Out-point boundary', category: 'marking' },
  { id: 'clear_in_out', name: 'Clear In & Out Points', description: 'Clear entire timeline Work Area boundaries', category: 'marking' },
  { id: 'add_marker', name: 'Add / Edit Marker', description: 'Place a sequence marker or edit marker under playhead', category: 'marking' },
  { id: 'jump_prev_marker', name: 'Jump to Previous Marker', description: 'Move playhead to preceding timeline marker', category: 'marking' },
  { id: 'jump_next_marker', name: 'Jump to Next Marker', description: 'Move playhead to succeeding timeline marker', category: 'marking' },

  // Audio & FX
  { id: 'audio_gain_dialog', name: 'Audio Gain & Fades Modal', description: 'Open dialog to adjust clip gain and crossfades', category: 'audio_fx' },
  { id: 'nudge_gain_up', name: 'Nudge Gain +1 dB', description: 'Increment selected clip volume by 1 decibel', category: 'audio_fx' },
  { id: 'nudge_gain_down', name: 'Nudge Gain -1 dB', description: 'Decrement selected clip volume by 1 decibel', category: 'audio_fx' },
  { id: 'add_adjustment_layer', name: 'Add Adjustment Layer', description: 'Create 5-second Adjustment Layer above playhead', category: 'audio_fx' },
  { id: 'create_compound_clip', name: 'Create Compound Clip', description: 'Package selected clips into nested compound container', category: 'audio_fx' },
  { id: 'decompose_compound_clip', name: 'Decompose Compound Clip', description: 'Unpack compound clip back into individual tracks', category: 'audio_fx' },

  // View
  { id: 'zoom_in', name: 'Zoom In Timeline', description: 'Increase horizontal timeline scale', category: 'view' },
  { id: 'zoom_out', name: 'Zoom Out Timeline', description: 'Decrease horizontal timeline scale', category: 'view' },
  { id: 'zoom_fit', name: 'Zoom to Fit Sequence', description: 'Scale timeline so all clips fit comfortably in viewport', category: 'view' },
  { id: 'toggle_snapping', name: 'Toggle Snapping', description: 'Enable or disable magnet snapping to clip boundaries and markers', category: 'view' },

  // History
  { id: 'undo', name: 'Undo', description: 'Undo the last edit operation', category: 'history' },
  { id: 'redo', name: 'Redo', description: 'Redo the previously undone operation', category: 'history' },
];

export interface NleKeymapProfile {
  id: NleProfileId;
  name: string;
  badge: string;
  description: string;
  bindings: Record<TimelineActionId, KeyBinding[]>;
}

// --------------------------------------------------------------------------------
// Standard Presets
// --------------------------------------------------------------------------------

/** VideoStudio Default: Clean, modern hybrid NLE mapping. */
export const VIDEOSTUDIO_KEYMAP: NleKeymapProfile = {
  id: 'videostudio',
  name: 'VideoStudio Default',
  badge: 'Recommended',
  description: 'Intuitive modern NLE shortcuts optimized for fast timeline workflows and stylus sketching.',
  bindings: {
    play_pause: [{ key: ' ' }],
    shuttle_left: [{ key: 'j' }],
    shuttle_stop: [{ key: 'k' }],
    shuttle_right: [{ key: 'l' }],
    step_backward: [{ key: 'ArrowLeft' }],
    step_forward: [{ key: 'ArrowRight' }],
    step_backward_second: [{ key: 'ArrowLeft', shift: true }],
    step_forward_second: [{ key: 'ArrowRight', shift: true }],
    jump_start: [{ key: 'Home' }],
    jump_end: [{ key: 'End' }],
    jump_prev_cut: [{ key: 'ArrowUp' }],
    jump_next_cut: [{ key: 'ArrowDown' }],
    toggle_loop: [{ key: 'l', ctrlOrMeta: true }],

    tool_select: [{ key: 'v' }],
    tool_split: [{ key: 'c' }],
    tool_ripple: [{ key: 'b' }],
    tool_roll: [{ key: 'n' }],
    tool_slip: [{ key: 'y' }],
    tool_slide: [{ key: 'u' }],
    tool_select_right: [{ key: 'a' }],
    tool_select_left: [{ key: 'a', shift: true }],
    tool_escape: [{ key: 'Escape' }],

    split_at_playhead: [{ key: 's' }],
    delete_selection: [{ key: 'Delete' }, { key: 'Backspace' }],
    ripple_delete: [{ key: 'Delete', shift: true }, { key: 'Backspace', shift: true }, { key: 'Delete', alt: true }],
    ripple_trim_head: [{ key: 'q' }],
    ripple_trim_tail: [{ key: 'w' }],
    lift_work_area: [{ key: ';' }],
    extract_work_area: [{ key: "'" }],
    slip_left: [{ key: 'ArrowLeft', alt: true }],
    slip_right: [{ key: 'ArrowRight', alt: true }],
    slip_left_large: [{ key: 'ArrowLeft', alt: true, shift: true }],
    slip_right_large: [{ key: 'ArrowRight', alt: true, shift: true }],

    mark_in: [{ key: 'i' }],
    mark_out: [{ key: 'o' }],
    clear_in: [{ key: 'i', alt: true }],
    clear_out: [{ key: 'o', alt: true }],
    clear_in_out: [{ key: 'x', alt: true }],
    add_marker: [{ key: 'm' }],
    jump_prev_marker: [{ key: 'm', alt: true }, { key: 'm', ctrlOrMeta: true, shift: true }],
    jump_next_marker: [{ key: 'm', shift: true }],

    audio_gain_dialog: [{ key: 'g' }],
    nudge_gain_up: [{ key: ']' }],
    nudge_gain_down: [{ key: '[' }],
    add_adjustment_layer: [{ key: 'a', alt: true }],
    create_compound_clip: [{ key: 'g', ctrlOrMeta: true }, { key: 'g', alt: true }],
    decompose_compound_clip: [{ key: 'g', ctrlOrMeta: true, shift: true }, { key: 'g', alt: true, shift: true }],

    zoom_in: [{ key: '=', ctrlOrMeta: true }, { key: '+' }],
    zoom_out: [{ key: '-', ctrlOrMeta: true }, { key: '-' }],
    zoom_fit: [{ key: 'z', shift: true }],
    toggle_snapping: [{ key: 's', shift: true }],

    undo: [{ key: 'z', ctrlOrMeta: true }],
    redo: [{ key: 'z', ctrlOrMeta: true, shift: true }, { key: 'y', ctrlOrMeta: true }],
  },
};

/** Adobe Premiere Pro Profile: Razor 'C', Add Edit 'Ctrl+K', Ripple Trim 'Q'/'W', Fit '\'. */
export const PREMIERE_KEYMAP: NleKeymapProfile = {
  id: 'premiere',
  name: 'Adobe Premiere Pro',
  badge: 'Broadcast',
  description: 'Classic Premiere layout with C razor blade, Q/W ripple trims, Ctrl+K add edit, and \\ zoom fit.',
  bindings: {
    play_pause: [{ key: ' ' }],
    shuttle_left: [{ key: 'j' }],
    shuttle_stop: [{ key: 'k' }],
    shuttle_right: [{ key: 'l' }],
    step_backward: [{ key: 'ArrowLeft' }],
    step_forward: [{ key: 'ArrowRight' }],
    step_backward_second: [{ key: 'ArrowLeft', shift: true }],
    step_forward_second: [{ key: 'ArrowRight', shift: true }],
    jump_start: [{ key: 'Home' }],
    jump_end: [{ key: 'End' }],
    jump_prev_cut: [{ key: 'ArrowUp' }],
    jump_next_cut: [{ key: 'ArrowDown' }],
    toggle_loop: [{ key: 'l', ctrlOrMeta: true }],

    tool_select: [{ key: 'v' }],
    tool_split: [{ key: 'c' }],
    tool_ripple: [{ key: 'b' }],
    tool_roll: [{ key: 'n' }],
    tool_slip: [{ key: 'y' }],
    tool_slide: [{ key: 'u' }],
    tool_select_right: [{ key: 'a' }],
    tool_select_left: [{ key: 'a', shift: true }],
    tool_escape: [{ key: 'Escape' }],

    split_at_playhead: [{ key: 'k', ctrlOrMeta: true }, { key: 's' }],
    delete_selection: [{ key: 'Delete' }, { key: 'Backspace' }],
    ripple_delete: [{ key: 'Delete', shift: true }, { key: 'Delete', alt: true }],
    ripple_trim_head: [{ key: 'q' }],
    ripple_trim_tail: [{ key: 'w' }],
    lift_work_area: [{ key: ';' }],
    extract_work_area: [{ key: "'" }],
    slip_left: [{ key: 'ArrowLeft', alt: true }],
    slip_right: [{ key: 'ArrowRight', alt: true }],
    slip_left_large: [{ key: 'ArrowLeft', alt: true, shift: true }],
    slip_right_large: [{ key: 'ArrowRight', alt: true, shift: true }],

    mark_in: [{ key: 'i' }],
    mark_out: [{ key: 'o' }],
    clear_in: [{ key: 'i', alt: true }],
    clear_out: [{ key: 'o', alt: true }],
    clear_in_out: [{ key: 'x', alt: true }],
    add_marker: [{ key: 'm' }],
    jump_prev_marker: [{ key: 'm', alt: true }, { key: 'm', ctrlOrMeta: true, shift: true }],
    jump_next_marker: [{ key: 'm', shift: true }],

    audio_gain_dialog: [{ key: 'g' }],
    nudge_gain_up: [{ key: ']' }],
    nudge_gain_down: [{ key: '[' }],
    add_adjustment_layer: [{ key: 'a', alt: true }],
    create_compound_clip: [{ key: 'g', ctrlOrMeta: true }, { key: 'g', alt: true }],
    decompose_compound_clip: [{ key: 'g', ctrlOrMeta: true, shift: true }, { key: 'g', alt: true, shift: true }],

    zoom_in: [{ key: '=', ctrlOrMeta: true }, { key: '=' }],
    zoom_out: [{ key: '-', ctrlOrMeta: true }, { key: '-' }],
    zoom_fit: [{ key: '\\' }],
    toggle_snapping: [{ key: 's' }],

    undo: [{ key: 'z', ctrlOrMeta: true }],
    redo: [{ key: 'z', ctrlOrMeta: true, shift: true }, { key: 'y', ctrlOrMeta: true }],
  },
};

/** DaVinci Resolve Profile: Blade 'B', Split 'Ctrl+B', Select 'A', Ripple Trim 'Shift+[' / 'Shift+]'. */
export const RESOLVE_KEYMAP: NleKeymapProfile = {
  id: 'resolve',
  name: 'DaVinci Resolve',
  badge: 'Hollywood',
  description: 'Blackmagic DaVinci Resolve layout with B blade tool, Ctrl+B split, Shift+[ / ] ripple trim, and Shift+Z fit.',
  bindings: {
    play_pause: [{ key: ' ' }],
    shuttle_left: [{ key: 'j' }],
    shuttle_stop: [{ key: 'k' }],
    shuttle_right: [{ key: 'l' }],
    step_backward: [{ key: 'ArrowLeft' }],
    step_forward: [{ key: 'ArrowRight' }],
    step_backward_second: [{ key: 'ArrowLeft', shift: true }],
    step_forward_second: [{ key: 'ArrowRight', shift: true }],
    jump_start: [{ key: 'Home' }],
    jump_end: [{ key: 'End' }],
    jump_prev_cut: [{ key: 'ArrowUp' }],
    jump_next_cut: [{ key: 'ArrowDown' }],
    toggle_loop: [{ key: '/', ctrlOrMeta: true }],

    tool_select: [{ key: 'a' }],
    tool_split: [{ key: 'b' }],
    tool_ripple: [{ key: 't' }],
    tool_roll: [{ key: 'u' }],
    tool_slip: [{ key: 'y', shift: true }, { key: 's', alt: true }],
    tool_slide: [{ key: 'u', shift: true }],
    tool_select_right: [{ key: 'y' }],
    tool_select_left: [{ key: 'y', ctrlOrMeta: true }],
    tool_escape: [{ key: 'Escape' }],

    split_at_playhead: [{ key: 'b', ctrlOrMeta: true }, { key: 's' }],
    delete_selection: [{ key: 'Backspace' }],
    ripple_delete: [{ key: 'Delete' }, { key: 'Backspace', shift: true }],
    ripple_trim_head: [{ key: '[', shift: true }],
    ripple_trim_tail: [{ key: ']', shift: true }],
    lift_work_area: [{ key: ';' }],
    extract_work_area: [{ key: "'" }],
    slip_left: [{ key: ',', ctrlOrMeta: true }],
    slip_right: [{ key: '.', ctrlOrMeta: true }],
    slip_left_large: [{ key: ',', ctrlOrMeta: true, shift: true }],
    slip_right_large: [{ key: '.', ctrlOrMeta: true, shift: true }],

    mark_in: [{ key: 'i' }],
    mark_out: [{ key: 'o' }],
    clear_in: [{ key: 'i', alt: true }],
    clear_out: [{ key: 'o', alt: true }],
    clear_in_out: [{ key: 'x', alt: true }],
    add_marker: [{ key: 'm' }],
    jump_prev_marker: [{ key: 'm', alt: true }, { key: 'm', ctrlOrMeta: true, shift: true }],
    jump_next_marker: [{ key: 'm', shift: true }],

    audio_gain_dialog: [{ key: 'g' }],
    nudge_gain_up: [{ key: ']' }],
    nudge_gain_down: [{ key: '[' }],
    add_adjustment_layer: [{ key: 'a', alt: true }],
    create_compound_clip: [{ key: 'g', ctrlOrMeta: true }, { key: 'g', alt: true }],
    decompose_compound_clip: [{ key: 'g', ctrlOrMeta: true, shift: true }, { key: 'g', alt: true, shift: true }],

    zoom_in: [{ key: '=', ctrlOrMeta: true }, { key: '=' }],
    zoom_out: [{ key: '-', ctrlOrMeta: true }, { key: '-' }],
    zoom_fit: [{ key: 'z', shift: true }],
    toggle_snapping: [{ key: 'n' }],

    undo: [{ key: 'z', ctrlOrMeta: true }],
    redo: [{ key: 'z', ctrlOrMeta: true, shift: true }, { key: 'y', ctrlOrMeta: true }],
  },
};

/** Apple Final Cut Pro Profile: Blade 'B', Select 'A', Trim 'T', Blade Cut 'Cmd+B', Trim 'Option+['. */
export const FINALCUT_KEYMAP: NleKeymapProfile = {
  id: 'finalcut',
  name: 'Apple Final Cut Pro',
  badge: 'Creative',
  description: 'Apple FCP magnetic timeline layout with A select, B blade, Cmd+B blade at playhead, and Option+[ / ] trim.',
  bindings: {
    play_pause: [{ key: ' ' }],
    shuttle_left: [{ key: 'j' }],
    shuttle_stop: [{ key: 'k' }],
    shuttle_right: [{ key: 'l' }],
    step_backward: [{ key: 'ArrowLeft' }],
    step_forward: [{ key: 'ArrowRight' }],
    step_backward_second: [{ key: 'ArrowLeft', shift: true }],
    step_forward_second: [{ key: 'ArrowRight', shift: true }],
    jump_start: [{ key: 'Home' }],
    jump_end: [{ key: 'End' }],
    jump_prev_cut: [{ key: 'ArrowUp' }],
    jump_next_cut: [{ key: 'ArrowDown' }],
    toggle_loop: [{ key: 'l', ctrlOrMeta: true }],

    tool_select: [{ key: 'a' }],
    tool_split: [{ key: 'b' }],
    tool_ripple: [{ key: 't' }],
    tool_roll: [{ key: 'r' }],
    tool_slip: [{ key: 'y' }],
    tool_slide: [{ key: 'u' }],
    tool_select_right: [{ key: 'p' }],
    tool_select_left: [{ key: 'p', shift: true }],
    tool_escape: [{ key: 'Escape' }],

    split_at_playhead: [{ key: 'b', ctrlOrMeta: true }, { key: 's' }],
    delete_selection: [{ key: 'Delete', shift: true }, { key: 'Delete', alt: true }],
    ripple_delete: [{ key: 'Delete' }, { key: 'Backspace' }],
    ripple_trim_head: [{ key: '[', alt: true }],
    ripple_trim_tail: [{ key: ']', alt: true }],
    lift_work_area: [{ key: ';' }],
    extract_work_area: [{ key: "'" }],
    slip_left: [{ key: ',', alt: true }],
    slip_right: [{ key: '.', alt: true }],
    slip_left_large: [{ key: ',', alt: true, shift: true }],
    slip_right_large: [{ key: '.', alt: true, shift: true }],

    mark_in: [{ key: 'i' }],
    mark_out: [{ key: 'o' }],
    clear_in: [{ key: 'i', alt: true }],
    clear_out: [{ key: 'o', alt: true }],
    clear_in_out: [{ key: 'x', alt: true }],
    add_marker: [{ key: 'm' }],
    jump_prev_marker: [{ key: 'm', alt: true }, { key: 'm', ctrlOrMeta: true, shift: true }],
    jump_next_marker: [{ key: 'm', shift: true }],

    audio_gain_dialog: [{ key: 'g' }],
    nudge_gain_up: [{ key: ']' }],
    nudge_gain_down: [{ key: '[' }],
    add_adjustment_layer: [{ key: 'a', alt: true }],
    create_compound_clip: [{ key: 'g', ctrlOrMeta: true }, { key: 'g', alt: true }],
    decompose_compound_clip: [{ key: 'g', ctrlOrMeta: true, shift: true }, { key: 'g', alt: true, shift: true }],

    zoom_in: [{ key: '=', ctrlOrMeta: true }, { key: '=' }],
    zoom_out: [{ key: '-', ctrlOrMeta: true }, { key: '-' }],
    zoom_fit: [{ key: 'z', shift: true }],
    toggle_snapping: [{ key: 'n' }],

    undo: [{ key: 'z', ctrlOrMeta: true }],
    redo: [{ key: 'z', ctrlOrMeta: true, shift: true }, { key: 'y', ctrlOrMeta: true }],
  },
};

/** CapCut Profile: Ultra-fast social media cutting shortcuts. */
export const CAPCUT_KEYMAP: NleKeymapProfile = {
  id: 'capcut',
  name: 'CapCut',
  badge: 'Viral / Fast',
  description: 'Streamlined creator shortcuts with B blade split, Backspace/Delete ripple, and fast cursor toggles.',
  bindings: {
    play_pause: [{ key: ' ' }],
    shuttle_left: [{ key: 'j' }],
    shuttle_stop: [{ key: 'k' }],
    shuttle_right: [{ key: 'l' }],
    step_backward: [{ key: 'ArrowLeft' }],
    step_forward: [{ key: 'ArrowRight' }],
    step_backward_second: [{ key: 'ArrowLeft', shift: true }],
    step_forward_second: [{ key: 'ArrowRight', shift: true }],
    jump_start: [{ key: 'Home' }],
    jump_end: [{ key: 'End' }],
    jump_prev_cut: [{ key: 'ArrowUp' }],
    jump_next_cut: [{ key: 'ArrowDown' }],
    toggle_loop: [{ key: 'l', ctrlOrMeta: true }],

    tool_select: [{ key: 'v' }],
    tool_split: [{ key: 'b' }],
    tool_ripple: [{ key: 'r' }],
    tool_roll: [{ key: 't' }],
    tool_slip: [{ key: 'y' }],
    tool_slide: [{ key: 'u' }],
    tool_select_right: [{ key: 'a' }],
    tool_select_left: [{ key: 'a', shift: true }],
    tool_escape: [{ key: 'Escape' }],

    split_at_playhead: [{ key: 'b', ctrlOrMeta: true }, { key: 's' }],
    delete_selection: [{ key: 'Delete', alt: true }],
    ripple_delete: [{ key: 'Delete' }, { key: 'Backspace' }],
    ripple_trim_head: [{ key: 'q' }],
    ripple_trim_tail: [{ key: 'w' }],
    lift_work_area: [{ key: ';' }],
    extract_work_area: [{ key: "'" }],
    slip_left: [{ key: 'ArrowLeft', alt: true }],
    slip_right: [{ key: 'ArrowRight', alt: true }],
    slip_left_large: [{ key: 'ArrowLeft', alt: true, shift: true }],
    slip_right_large: [{ key: 'ArrowRight', alt: true, shift: true }],

    mark_in: [{ key: 'i' }],
    mark_out: [{ key: 'o' }],
    clear_in: [{ key: 'i', alt: true }],
    clear_out: [{ key: 'o', alt: true }],
    clear_in_out: [{ key: 'x', alt: true }],
    add_marker: [{ key: 'm' }],
    jump_prev_marker: [{ key: 'm', alt: true }, { key: 'm', ctrlOrMeta: true, shift: true }],
    jump_next_marker: [{ key: 'm', shift: true }],

    audio_gain_dialog: [{ key: 'g' }],
    nudge_gain_up: [{ key: ']' }],
    nudge_gain_down: [{ key: '[' }],
    add_adjustment_layer: [{ key: 'a', alt: true }],
    create_compound_clip: [{ key: 'g', ctrlOrMeta: true }, { key: 'g', alt: true }],
    decompose_compound_clip: [{ key: 'g', ctrlOrMeta: true, shift: true }, { key: 'g', alt: true, shift: true }],

    zoom_in: [{ key: '=', ctrlOrMeta: true }, { key: '=' }],
    zoom_out: [{ key: '-', ctrlOrMeta: true }, { key: '-' }],
    zoom_fit: [{ key: 'z', shift: true }],
    toggle_snapping: [{ key: 'n' }],

    undo: [{ key: 'z', ctrlOrMeta: true }],
    redo: [{ key: 'z', ctrlOrMeta: true, shift: true }, { key: 'y', ctrlOrMeta: true }],
  },
};

export const ALL_NLE_PROFILES: Record<NleProfileId, NleKeymapProfile> = {
  videostudio: VIDEOSTUDIO_KEYMAP,
  premiere: PREMIERE_KEYMAP,
  resolve: RESOLVE_KEYMAP,
  finalcut: FINALCUT_KEYMAP,
  capcut: CAPCUT_KEYMAP,
};

// --------------------------------------------------------------------------------
// Utilities: Matching, Formatting, & Conflict Detection
// --------------------------------------------------------------------------------

/** Human-readable string for key binding: e.g. "Ctrl+Shift+Z", "Space", "Alt+G". */
export function formatKeyBinding(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrlOrMeta) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');

  let keyStr = binding.key;
  if (keyStr === ' ') keyStr = 'Space';
  else if (keyStr.length === 1) keyStr = keyStr.toUpperCase();
  parts.push(keyStr);

  return parts.join('+');
}

/** Normalized key representation matching KeyboardEvent.key. */
export function normalizeKey(key: string): string {
  if (key === ' ' || key === 'Spacebar') return ' ';
  if (key.length === 1) return key.toLowerCase();
  return key;
}

/** Check if a native KeyboardEvent satisfies a KeyBinding. */
export function matchesKeyBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  const eventCtrlOrMeta = event.ctrlKey || event.metaKey;
  const targetCtrlOrMeta = Boolean(binding.ctrlOrMeta);
  if (eventCtrlOrMeta !== targetCtrlOrMeta) return false;

  const eventAlt = event.altKey;
  const targetAlt = Boolean(binding.alt);
  if (eventAlt !== targetAlt) return false;

  const eventShift = event.shiftKey;
  const targetShift = Boolean(binding.shift);
  if (eventShift !== targetShift) return false;

  const eventKeyNorm = normalizeKey(event.key);
  const targetKeyNorm = normalizeKey(binding.key);

  return eventKeyNorm === targetKeyNorm;
}

/** Look up which action matches a keyboard event from effective keybindings. */
export function resolveActionForEvent(
  event: KeyboardEvent,
  bindings: Record<TimelineActionId, KeyBinding[]>,
): TimelineActionId | null {
  for (const [actionId, keyBindings] of Object.entries(bindings) as [TimelineActionId, KeyBinding[]][]) {
    for (const binding of keyBindings) {
      if (matchesKeyBinding(event, binding)) {
        return actionId;
      }
    }
  }
  return null;
}

export interface KeymapConflict {
  keyString: string;
  actionA: TimelineActionId;
  actionB: TimelineActionId;
}

/** Detect duplicate shortcut assignments across timeline actions. */
export function findKeymapConflicts(
  bindings: Record<TimelineActionId, KeyBinding[]>,
): KeymapConflict[] {
  const conflicts: KeymapConflict[] = [];
  const seen = new Map<string, TimelineActionId>();

  for (const [actionId, list] of Object.entries(bindings) as [TimelineActionId, KeyBinding[]][]) {
    for (const b of list) {
      const keyStr = formatKeyBinding(b);
      const existing = seen.get(keyStr);
      if (existing && existing !== actionId) {
        conflicts.push({ keyString: keyStr, actionA: existing, actionB: actionId });
      } else {
        seen.set(keyStr, actionId);
      }
    }
  }

  return conflicts;
}
