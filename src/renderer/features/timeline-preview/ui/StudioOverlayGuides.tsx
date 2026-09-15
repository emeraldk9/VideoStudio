export interface StudioOverlayGuidesProps {
  showSafeAreas: boolean;
  showThirdsGrid: boolean;
  showSocialZones: boolean;
}

export function StudioOverlayGuides({
  showSafeAreas,
  showThirdsGrid,
  showSocialZones,
}: StudioOverlayGuidesProps) {
  if (!showSafeAreas && !showThirdsGrid && !showSocialZones) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none">
      {/* 1. Rule of Thirds (3x3 Grid) */}
      {showThirdsGrid && (
        <div className="absolute inset-0">
          {/* Vertical Lines */}
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/20 border-r border-dashed border-black/30" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/20 border-r border-dashed border-black/30" />
          {/* Horizontal Lines */}
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/20 border-b border-dashed border-black/30" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/20 border-b border-dashed border-black/30" />
        </div>
      )}

      {/* 2. Broadcast Title Safe (90%) & Action Safe (93%) + Center Crosshair */}
      {showSafeAreas && (
        <>
          {/* Action Safe (93%) */}
          <div className="absolute inset-[3.5%] rounded-xs border border-dashed border-white/25">
            <span className="absolute left-1 top-0.5 font-mono text-[8px] uppercase tracking-wider text-white/40">
              Action Safe 93%
            </span>
          </div>

          {/* Title Safe (90%) */}
          <div className="absolute inset-[5%] rounded-xs border border-cyan-400/40">
            <span className="absolute left-1 top-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-400/60">
              Title Safe 90%
            </span>
          </div>

          {/* Center Crosshair */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-4 w-px bg-cyan-400/50 absolute left-0 -top-2" />
            <div className="w-4 h-px bg-cyan-400/50 absolute -left-2 top-0" />
          </div>
        </>
      )}

      {/* 3. Social Media UI Safe Zone Simulator (TikTok / Reels / Shorts) */}
      {showSocialZones && (
        <div className="absolute inset-0">
          {/* Top Bar Warning (Profile / Live buttons) */}
          <div className="absolute inset-x-0 top-0 h-[12%] bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-center">
            <span className="font-mono text-[9px] font-semibold text-rose-400 uppercase tracking-wider">
              Top Bar UI Obscured
            </span>
          </div>

          {/* Bottom Captions & Music Area */}
          <div className="absolute inset-x-0 bottom-0 h-[22%] bg-rose-500/10 border-t border-rose-500/30 flex flex-col items-center justify-center p-1">
            <span className="font-mono text-[9px] font-semibold text-rose-400 uppercase tracking-wider">
              Captions & Audio Name UI Safe Area
            </span>
            <span className="font-mono text-[8px] text-text-disabled mt-0.5">
              Keep critical graphics above this line
            </span>
          </div>

          {/* Right Column (Like, Comment, Share, Bookmark buttons) */}
          <div className="absolute right-0 top-[18%] bottom-[24%] w-[16%] bg-rose-500/10 border-l border-rose-500/30 flex items-center justify-center">
            <div className="rotate-90 font-mono text-[8px] font-semibold text-rose-400 whitespace-nowrap">
              Action Rail UI
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
