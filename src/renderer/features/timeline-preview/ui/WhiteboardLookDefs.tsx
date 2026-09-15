import { WHITEBOARD_LOOK_FILTER_IDS } from '../lib/whiteboardLookFilter';

/**
 * Beta S303 — the board looks as SVG filters, mounted once per whiteboard
 * frame so `filter: url(#…)` on the still resolves.
 *
 * Why SVG and not CSS: CSS `filter` has `grayscale`/`contrast`/`blur` but no
 * edge-detect primitive, and every look here is an edge operator or a
 * quantizer. `feConvolveMatrix` and `feComponentTransfer` are the only things
 * in the platform that reach them.
 *
 * `colorInterpolationFilters="sRGB"` on every filter is load-bearing: the SVG
 * default is linearRGB, which would run the kernels over linearized values and
 * lift the midtones well away from what the export's chain produces on the
 * same picture. It is not a nicety — omit it and Comic's tone bands land in
 * visibly different places.
 *
 * Zero by design: the shapes here are approximations of the ffmpeg chains, not
 * compilations of them — see the header of `whiteboardLookFilter.ts` for why
 * this is not (and cannot be) the two-consumer pattern the reveal geometry uses.
 */
export function WhiteboardLookDefs() {
  return (
    <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0">
      <defs>
        {/* Sketch — the 4-neighbour Laplacian is the nearest single-kernel
            stand-in for canny: near-zero across flat areas, bright on
            boundaries. Inverted to ink-on-paper, then a contrast lift to
            match `eq=contrast=1.4`. */}
        <filter
          id={WHITEBOARD_LOOK_FILTER_IDS.sketch}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feColorMatrix type="saturate" values="0" result="wbsGray" />
          <feConvolveMatrix
            in="wbsGray"
            order="3"
            kernelMatrix="0 -1 0 -1 4 -1 0 -1 0"
            divisor="1"
            preserveAlpha
            result="wbsEdge"
          />
          <feComponentTransfer in="wbsEdge" result="wbsInk">
            <feFuncR type="table" tableValues="1 0" />
            <feFuncG type="table" tableValues="1 0" />
            <feFuncB type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feComponentTransfer in="wbsInk">
            <feFuncR type="linear" slope="1.4" intercept="-0.2" />
            <feFuncG type="linear" slope="1.4" intercept="-0.2" />
            <feFuncB type="linear" slope="1.4" intercept="-0.2" />
          </feComponentTransfer>
        </filter>

        {/* Pencil — the 8-neighbour kernel responds to more of the picture than
            Sketch's 4-neighbour one and blurs into lead rather than wire, which
            is the same *relationship* the export has (sobel's unthresholded
            gradient vs canny's binary wires) even though the operators differ.
            The grain is `feTurbulence` compressed to 0.84–1.0 and multiplied —
            the export re-rolls its noise per frame and this does not, so the
            page has tooth but does not shimmer. */}
        <filter
          id={WHITEBOARD_LOOK_FILTER_IDS.pencil}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feColorMatrix type="saturate" values="0" result="wbpGray" />
          <feConvolveMatrix
            in="wbpGray"
            order="3"
            kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1"
            divisor="1"
            preserveAlpha
            result="wbpEdge"
          />
          <feGaussianBlur in="wbpEdge" stdDeviation="0.7" result="wbpSoft" />
          <feComponentTransfer in="wbpSoft" result="wbpInk">
            <feFuncR type="table" tableValues="1 0" />
            <feFuncG type="table" tableValues="1 0" />
            <feFuncB type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves={2}
            seed={7}
            result="wbpNoise"
          />
          <feColorMatrix in="wbpNoise" type="saturate" values="0" result="wbpNoiseGray" />
          <feComponentTransfer in="wbpNoiseGray" result="wbpGrain">
            <feFuncR type="linear" slope="0.16" intercept="0.84" />
            <feFuncG type="linear" slope="0.16" intercept="0.84" />
            <feFuncB type="linear" slope="0.16" intercept="0.84" />
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
          <feBlend in="wbpInk" in2="wbpGrain" mode="multiply" result="wbpGrained" />
          {/* The turbulence is opaque everywhere, so without this the filter
              would paint grain across the element's transparent letterbox as
              well as the picture. Re-imposing the source alpha keeps it on the
              still. */}
          <feComposite in="wbpGrained" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Comic — the honest twin of the export's `lutyuv=y=trunc(val/64)*64+32`:
            a discrete transfer with five stops is the same quantize-luma-into-
            flat-bands operation, not an approximation of it. */}
        <filter
          id={WHITEBOARD_LOOK_FILTER_IDS.comic}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feColorMatrix type="saturate" values="0" result="wbcGray" />
          <feComponentTransfer in="wbcGray" result="wbcBands">
            <feFuncR type="discrete" tableValues="0 0.25 0.5 0.75 1" />
            <feFuncG type="discrete" tableValues="0 0.25 0.5 0.75 1" />
            <feFuncB type="discrete" tableValues="0 0.25 0.5 0.75 1" />
          </feComponentTransfer>
          <feComponentTransfer in="wbcBands">
            <feFuncR type="linear" slope="1.5" intercept="-0.25" />
            <feFuncG type="linear" slope="1.5" intercept="-0.25" />
            <feFuncB type="linear" slope="1.5" intercept="-0.25" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
