# Vendored: Veo watermark templates and catalogue

Beta S235. Three files copied **verbatim** from
[`GargantuaX/gemini-watermark-remover`](https://github.com/GargantuaX/gemini-watermark-remover)
v1.0.41, which is MIT licensed. `LICENSE` in this directory is that project's licence file,
unmodified, and it carries both required copyright lines:

```
Copyright (c) 2025 Jad
Copyright (c) 2024 AllenK (Kwyshell)
```

The second line is because the alpha mask assets originate in
[`allenk/GeminiWatermarkTool`](https://github.com/allenk/GeminiWatermarkTool) (also MIT), whose
author asks that the notice be preserved when the masks are redistributed. It is preserved here
and must also appear in the repository-root `THIRD_PARTY_NOTICES.md`.

## Why these are vendored rather than imported

We *do* depend on `@pilio/gemini-watermark-remover` from npm — but only for the image path
(`/image-data`). The published tarball **does not contain `src/video/`** at all: it ships
`src/core`, `src/sdk`, `src/cli`, `src/runtime`, `src/shared` and `src/userscript`, with the
video logic present only as a pre-built browser bundle (`dist/video-app.js`) and a Playwright
shim (`src/sdk/video.js`). The package's `exports` map also blocks deep imports, so nothing
under `src/core/` or `src/video/` can be reached by path.

Since Phase 0 found that real Flow clips carry the **Veo text watermark** (step file §2.5),
these files are on the primary path for this feature, not an optional extra. Vendoring is the
only way to get them.

## What is here

| File | Lines | Imports | Role |
|---|---|---|---|
| `veoTextWatermarkTemplates.js` | 129 | none | The three Veo wordmark alpha templates (23x10, 68x30, 99x43) as embedded base64, with margins and `minNcc`. |
| `videoWatermarkCatalog.js` | 255 | none | The Veo diamond catalogue: a reference 1920x1080 pair, long-side projection, and the exact-size exceptions projection alone would get wrong. |
| `veoTextWatermarkDetector.js` | 513 | the templates file | `scoreVeoTextTemplateAt` and friends — pure `ImageData` NCC scoring, no DOM. |
| `embeddedAlphaMaps.js` | 102 | the two outline files | The square glyph masks at 48 and 96, plus the `36-v2` and dated variants. This is the mask the Veo **diamond** and the Gemini still badge both use — the catalogue only decides where it sits and how big it is. |
| `embeddedOutlineAlphaMap.js` | — | none | The light-outline variant, as base64 int16. |
| `embeddedDarkOutlineAlphaMap.js` | — | none | The dark-outline variant. Its values are **signed**: a negative entry marks a dark-polarity mark, meaning the same opacity over black rather than white. |

Every import here is a sibling — nothing reaches into `../core`, which is what keeps this a
six-file drop rather than a sixty-file one. The last three were added when the diamond family
needed its mask: routing it to a fill engine instead would have left one of the two Veo mark
families measurably worse for no licensing or size reason worth having.

## Rules for this directory

- **Do not edit these files.** They are upstream code. If a fix is needed, wrap it in
  `src/main/media/watermark-*.ts` instead, so the next upstream sync stays a straight copy.
- They are `.js` on purpose. `tsconfig.json` sets `allowJs: true`, and `npm run lint` only
  covers `.ts`/`.tsx`, so vendored code cannot spend the zero-warning budget.
- The removal arithmetic itself is **not** vendored. `watermark-unblend.ts` reimplements it in
  TypeScript — it is ~30 lines, we validated it against a round-trip oracle in Phase 0, and
  owning it means the constants are visible and testable rather than buried in a dependency.

## Re-syncing

Copy the same three files from a newer upstream tag, re-run
`tests/unit/main/media/watermark-region.test.ts` and the round-trip oracle, and check whether
`VEO_TEXT_GEOMETRY` in `watermark-region.ts` still matches the templates' metadata. Watermark
geometry has shifted several times upstream; that test is what catches it.
