import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDismissOnOutside } from './DropdownPanel';
import { IconButton } from './IconButton';

export interface DownloadQualityOption {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
}

export interface DownloadQualityMenuProps {
  options: DownloadQualityOption[];
  onDownloadAtQuality: (quality: string) => Promise<void>;
}

/**
 * Beta Step 15 — the download-quality picker, echoing Flow's own Download
 * submenu. Shared by `QueueGridCard` and `VideoLightboxModal` (originally
 * inlined in the card alone) — extracted once a second caller needed the
 * exact same portal-positioning fix rather than risking the two copies
 * drifting apart.
 *
 * Portalled to `document.body` at a measured `fixed` position (the same
 * trick `Select` uses) instead of `absolute`-relative-to-trigger: a plain
 * `absolute` panel is clipped by the first `overflow-hidden`/scrolling
 * ancestor regardless of z-index — both callers have one (the grid tile's
 * rounded-thumbnail clip, the lightbox drawer's own scroll container).
 */
export function DownloadQualityMenu({ options, onDownloadAtQuality }: DownloadQualityMenuProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  const close = () => setOpen(false);
  // The second ref matters here: the panel is portalled outside this
  // container's DOM subtree, so without it a click inside the panel reads as
  // an outside click and closes the very option list being clicked.
  useDismissOnOutside(open, close, triggerRef, panelRef);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  const pick = (quality: string) => {
    setOpen(false);
    setDownloading(true);
    void onDownloadAtQuality(quality).finally(() => setDownloading(false));
  };

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        icon={downloading ? 'progress_activity' : 'download'}
        label={downloading ? 'Downloading…' : 'Download'}
        onClick={() => !downloading && setOpen((isOpen) => !isOpen)}
        className="pointer-events-auto"
      />
      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              style={{ position: 'fixed', top: position.top, right: position.right }}
              className="z-50 w-max min-w-32 rounded-[var(--radius-dialog)] border border-hairline bg-bg-workspace p-1 shadow-lg"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => pick(option.value)}
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-button)] px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span>{option.label}</span>
                  {option.hint ? (
                    <span className="text-[10px] uppercase tracking-wide text-text-disabled">{option.hint}</span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
