import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { readLocalSetting, writeLocalSetting } from '../lib/localSetting';

import { IconButton } from './IconButton';

export type DrawerSize = 'sm' | 'lg';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * Beta S507 — the panel's opening width. `'sm'` (the default, 384px) is the
   * settings-panel shape every existing caller was built for; `'lg'` (720px)
   * is for working material with rows and columns — the continuity ledger —
   * that a settings width folds into a single unreadable column.
   */
  size?: DrawerSize;
  /**
   * Beta S507 — a drag handle on the panel's inner edge, keyboard-operable
   * (arrow keys, 32px a press). Off by default: a drawer of four fields has
   * nothing to gain from being wider.
   */
  resizable?: boolean;
  /**
   * Beta S507 — where the dragged width is remembered (`localStorage`), so the
   * drawer reopens at the width the user last left it. Absent, a resize lasts
   * until the drawer closes.
   */
  widthStorageKey?: string;
  /** Beta S508 — one line under the title: what the panel is about (an episode, a count). */
  subtitle?: ReactNode;
  /** Beta S508 — controls in the header, left of Close (an import/export menu). */
  headerActions?: ReactNode;
  /**
   * Beta S508 — hands the body's scrolling and padding to the caller, the
   * same contract as `Modal.bodyScroll`. A split layout scrolls each pane on
   * its own and must not also scroll the whole body.
   */
  bodyScroll?: boolean;
}

/** Narrower than this and the header's title and X collide. */
export const DRAWER_MIN_WIDTH = 320;
/** One arrow-key press. */
export const DRAWER_KEYBOARD_STEP = 32;
const DEFAULT_WIDTH: Record<DrawerSize, number> = { sm: 384, lg: 720 };

/** The widest a drawer may be: it must never hide the whole workspace. */
function maxDrawerWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH.lg;
  return Math.max(DRAWER_MIN_WIDTH, Math.floor(window.innerWidth * 0.9));
}

function clampWidth(width: number): number {
  return Math.min(maxDrawerWidth(), Math.max(DRAWER_MIN_WIDTH, Math.round(width)));
}

function initialWidth(size: DrawerSize, storageKey: string | undefined): number {
  const stored = storageKey ? Number(readLocalSetting(storageKey)) : Number.NaN;
  return clampWidth(Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WIDTH[size]);
}

/**
 * Right-edge slide-in panel for secondary settings that don't need a modal's
 * full attention-block — same Escape/backdrop-dismiss contract as `Modal`,
 * but docked to an edge and full-height instead of centered, the standard
 * shape for a settings/details panel (VS Code, Figma, browser DevTools) as
 * opposed to a blocking dialog that interrupts the task at hand.
 *
 * Beta S507 — and, like those panels, it can be dragged wider. The width was
 * `max-w-sm` for every caller, which fit a settings form and folded the
 * continuity ledger's setups-and-shots rows into one column; the owner's
 * report was a panel that "can't be resized". The handle is the panel's
 * inner edge, the same place every docked panel puts it.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  size = 'sm',
  resizable = false,
  widthStorageKey,
  subtitle,
  headerActions,
  bodyScroll = true,
}: DrawerProps) {
  const [width, setWidth] = useState(() => initialWidth(size, widthStorageKey));

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Remembered on every change rather than on release: a keyboard resize has
  // no release, and one string write per step is nothing.
  useEffect(() => {
    if (widthStorageKey) writeLocalSetting(widthStorageKey, String(width));
  }, [width, widthStorageKey]);

  if (!open) {
    return null;
  }

  // The panel is docked right, so its width is the distance from the pointer
  // to the window's right edge — no start offset to keep.
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setWidth(clampWidth(window.innerWidth - event.clientX));
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  // Left grows the panel (its edge moves left), right shrinks it.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowLeft' ? DRAWER_KEYBOARD_STEP : event.key === 'ArrowRight' ? -DRAWER_KEYBOARD_STEP : 0;
    if (delta === 0) return;
    event.preventDefault();
    setWidth((current) => clampWidth(current + delta));
  };

  return createPortal(
    // Beta Step 64 — the panel starts **below the app's title bar**, not at the
    // top of the window (owner-reported 2026-08-02).
    //
    // `titleBarStyle: 'hidden'` plus `titleBarOverlay` means the OS paints the
    // minimise/maximise/close buttons over the top-right of the web content,
    // always above the DOM. A full-height panel put its own title and its own
    // close button directly underneath them: the heading was unreadable and the
    // drawer's X sat immediately beside the window's X, which is the one pair of
    // buttons that must never be confusable. `Modal` never hit this because its
    // `pt-[8vh]` clears the row by accident; a drawer is edge-to-edge by design,
    // so it has to clear it on purpose.
    //
    // The backdrop still covers the whole window — dimming everything is what
    // says the drawer has focus, and the native controls stay clickable because
    // the OS draws them above all of this anyway.
    <div
      className="fixed inset-0 z-50 flex justify-end bg-scrim"
      style={{ paddingTop: 'var(--titlebar-height)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        className="relative flex h-full max-w-[90vw] flex-col bg-bg-workspace outline-none"
        style={{ width, boxShadow: 'var(--shadow-elevated)' }}
        onClick={(event) => event.stopPropagation()}
      >
        {resizable ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuenow={width}
            aria-valuemin={DRAWER_MIN_WIDTH}
            aria-valuemax={maxDrawerWidth()}
            tabIndex={0}
            className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors duration-100 ease-out hover:bg-bg-selected focus-visible:bg-bg-selected"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
          />
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <h2 id="drawer-title" className="text-sm font-semibold text-text-primary">
              {title}
            </h2>
            {subtitle ? (
              <p className="truncate text-xs text-text-secondary">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
        </div>
        <div className={bodyScroll ? 'flex-1 overflow-y-auto p-4' : 'flex min-h-0 flex-1 flex-col'}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
