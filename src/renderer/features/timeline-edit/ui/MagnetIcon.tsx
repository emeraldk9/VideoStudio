/**
 * Beta S177 — the snapping magnet, from Lucide's `magnet` (ISC licence),
 * inlined as an SVG rather than added as a dependency.
 *
 * Two reasons it is not a Material Symbols ligature like every other icon in
 * the app: the Material set has **no magnet**, and S173 shipped
 * `align_horizontal_left` as a stand-in that reads as an alignment control,
 * not a magnet (owner report). Two reasons it is not `lucide-react`: the
 * package is not a dependency, and pulling an icon library in for one glyph
 * is a bundle and a supply-chain surface bought for nothing.
 *
 * `currentColor` + `stroke` keep it on `IconButton`'s tone classes, so it
 * dims and brightens with every other control in the toolbar. Lucide's own
 * canvas is 24×24 with a 2px stroke; rendered at 18px here to sit level with
 * the Material glyphs beside it, which are optically slightly smaller than
 * their box.
 */
export function MagnetIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" />
      <path d="m5 8 4 4" />
      <path d="m12 15 4 4" />
    </svg>
  );
}
