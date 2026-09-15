import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Closes a transient panel on an outside click or Escape.
 *
 * Extracted because three components had grown their own copy and they had
 * drifted: `AccountMenu` handled both, `ProjectSelector` handled only the
 * outside click — so the project dropdown could not be dismissed from the
 * keyboard at all — and `InfoPopover` had a third copy. A panel that can only
 * be closed by clicking exactly the right thing is a trap.
 *
 * `mousedown` rather than `click`: the panel must go away as the press starts,
 * or a click that lands on a control behind it fires with the panel still up.
 */
export function useDismissOnOutside(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  /**
   * A second element that also counts as "inside".
   *
   * Needed when the panel is portalled out of the trigger's subtree to escape
   * an ancestor's `overflow-hidden` — it is then not a descendant of
   * `containerRef`, so without this a click inside the panel reads as an
   * outside click and closes the very thing being clicked.
   */
  panelRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef?.current?.contains(target)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, containerRef, panelRef]);
}

export interface DropdownPanelProps {
  /** Which edge of the trigger the panel hangs from. */
  align?: 'left' | 'right';
  /**
   * Which way the panel opens.
   *
   * Beta Step 47: the account cluster moved to the *bottom* of the sidebar, and
   * a panel that only ever hangs downward opens off the bottom of the window
   * from there. The trigger's position decides this, so it stays a prop rather
   * than becoming measurement — every current caller knows statically where it
   * sits.
   */
  side?: 'below' | 'above';
  /** Tailwind width class — panels differ in content width, not in chrome. */
  width?: string;
  /**
   * ARIA role, which genuinely differs by content: a list of projects is a
   * `listbox`, an account summary is a `dialog`. The chrome is shared; the
   * semantics are not, and forcing one role on both would be wrong.
   */
  role?: 'listbox' | 'menu' | 'dialog';
  'aria-label'?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The floating surface every dropdown in the app hangs below its trigger.
 *
 * Exists because the three that had grown independently disagreed on all of it:
 * `z-50` vs `z-30`, `bg-bg-workspace` vs `bg-bg-canvas`, `radius-dialog` vs
 * `radius-card`, shadow vs none. None of those differences meant anything —
 * they were just whichever values each author reached for — and the result was
 * that two menus opened from the same header looked like parts of different
 * applications.
 *
 * Position and dismissal stay with the caller (via `useDismissOnOutside`),
 * because the trigger is what owns the open state.
 */
export function DropdownPanel({
  align = 'right',
  side = 'below',
  width = 'w-56',
  role,
  className = '',
  children,
  ...rest
}: DropdownPanelProps) {
  return (
    <div
      role={role}
      className={`absolute z-40 ${side === 'below' ? 'top-9' : 'bottom-9'} ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${width} rounded-[var(--radius-dialog)] border border-hairline bg-bg-workspace p-1 shadow-lg ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
