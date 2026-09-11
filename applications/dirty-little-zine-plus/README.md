# Dirty Little Zine Plus

A browser tool for laying out an 8-page fold-and-cut zine from your photos and
exporting a print-ready PDF. No backend, no build step, no upload: photos are
decoded, filtered, and encoded into the PDF entirely in the tab.

Inspired by [dirtylittlezine.com](https://dirtylittlezine.com), rewritten to add
multi-photo pages, print filters, zoom, and a non-flattened PDF.

## Run it

Any static file server, because that is all it needs:

```sh
python3 -m http.server 8731
# open http://127.0.0.1:8731
```

Deploy by copying the directory to Cloudflare Pages, GitHub Pages, Netlify, S3,
or anything else that serves files. There is nothing to configure.

The app itself has no build step and none is required to run or host it. On
this site only, `scripts/minify-zine.mjs` bundles and minifies the deployed
copy into `_site` during CI, which cuts the served payload by about 46% and
takes it from eleven requests to two. It never touches the source tree, so what
is in the repo stays readable and directly runnable.

## What it does that the original does not

| | Original | Here |
|---|---|---|
| Photos per page | 1, or 2 if landscape | 1 to 6, ten layout templates |
| Photo transform | pan only, one axis | pan both axes plus 1x to 6x zoom, anchored at the cursor |
| Filters | none | 11 presets, 5 print effects, 8 adjustment sliders |
| PDF | whole sheet flattened to one JPEG | per-photo JPEGs plus transparent text overlays |
| Typefaces | 11 built in | built-ins plus any font file you add |
| Text colour | white or black | white, black, or custom ink and shadow |
| Paper | Letter, A4, A3 | adds Tabloid |

### Effects

`threshold`, `dither` (Bayer 8x8), `halftone` (rotated dot screen), `duotone`,
and `posterize` run as pixel passes, because none of them are expressible in
`ctx.filter`. Adjustments (brightness, contrast, saturation, grayscale, sepia,
blur) use `ctx.filter` where the browser supports it, with a hand-written
fallback for the Safari versions that ignore it silently.

Dot pitch, dither cell, and grain are specified in **millimetres**, not pixels,
so what you see on screen is the coarseness that lands on paper.

## Adding your own fonts

Drop a `.ttf`, `.otf`, `.woff`, `.woff2`, or `.ttc` anywhere on the page, or use
the **Add** button beside any typeface picker. The font appears in the cover and
caption pickers immediately and persists in IndexedDB across reloads. Remove one
from the **Added fonts** panel.

No upload happens: `FontFace` accepts raw bytes, so the file is registered from
an ArrayBuffer with no network request and no CSP exemption.

Custom faces need the typographic profile the renderer uses to size a masthead,
and nobody knows those numbers for a font they just downloaded, so `fonts.js`
measures the face and derives them. Average advance width sets the title size
cap (a condensed face can be set far larger at the same column width), and the
font bounding box sets line leading.

**On the PDF:** the exporter rasterizes lettering to a transparent overlay at
300 DPI rather than embedding PDF text, so a custom font prints exactly as it
previews and no font data is embedded in the output file.

## Architecture

Everything is an ES module, loaded directly. No bundler.

| Module | Responsibility |
|---|---|
| `geometry.js` | Sheet imposition, panel rects, `coverRect`/`containRect` with zoom |
| `layouts.js` | Multi-photo cell templates |
| `filters.js` | Effect pipeline, presets, per-photo result cache |
| `state.js` | Document model and mutations |
| `fonts.js` | User font registration, metric calibration, persistence |
| `photo-store.js` | Decode, downscale to two variants, IndexedDB |
| `storage.js` | Text and config in localStorage |
| `renderer.js` | Canvas drawing, shared by preview and export |
| `export-pdf.js` | pdf-lib assembly, PNG sheet export |
| `app.js` | UI, pointer interaction, ingest |

### Two photo variants

Each upload is stored twice: a 1400px preview and a 3200px full. Panning
re-runs the whole effect pipeline every frame, and doing that against a 3200px
source is what makes an editor feel broken. Export loads the full variant on
demand and releases it afterwards.

### Why the PDF is not one big image

The original renders the entire 300 DPI sheet to a canvas, converts it to a
JPEG data URL, and drops that single image onto the page. That flattens
lettering into the photo raster and produces large files. Here each photo is
embedded as its own JPEG at its final cropped resolution, and cover text and
captions ride on transparent PNG overlays, so text edges stay sharp.

## Privacy

Photos never leave the browser. There is no `fetch`, `XMLHttpRequest`,
`WebSocket`, or `sendBeacon` anywhere in `js/`, and `index.html` ships a CSP
with `connect-src 'none'` that makes it enforced rather than merely intended.

pdf-lib is vendored in `vendor/` so no third-party script host is contacted.
The only external request is the Google Fonts stylesheet; every font stack has
a system fallback, so blocking it degrades rather than breaks.

## Known limits

- 8-page single-sheet format only. `geometry.js` holds the imposition as data,
  so other folds are additive work, not a rewrite.
- Zooming past roughly 3x on a large sheet exceeds the 3200px stored source.
  The inspector shows the effective DPI once it drops below print quality.
- Halftone and dither at export resolution are single-threaded pixel passes.
  A full sheet of heavily screened photos takes a few seconds to export.
- An added font is labelled from its filename. The real name table is not
  parsed, partly because woff2 keeps it compressed.
