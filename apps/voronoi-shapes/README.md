# Voronoi Shapes

Fills regions of an SVG with a Voronoi cell pattern and exports the result as a
laser-cuttable SVG. Upload a line drawing, click inside the closed areas you
want patterned, and the app flood-fills each one, scatters points inside it, and
cuts the region into Voronoi cells separated by a web of solid material.

The export is sized in the source SVG's physical units, so the web width, stroke
width and minimum cell size below are real millimetres on the cut bed, not
pixels.

## Using it

1. Drop in an SVG. Strokes are thickened internally before flood fill, so thin
   outlines still act as boundaries.
2. Click a region to select it. Click again to deselect. Each selected region
   gets its own colour chip and its own Voronoi fill.
3. Tune the settings, then **Download SVG**.

Settings worth knowing:

- **Web Width** — material left between cells. Too thin and the piece falls
  apart on the bed.
- **Min Cell Size** — cells smaller than this are dropped instead of cut.
- **Fill Tolerance** — how strictly flood fill treats a boundary. Raise it when
  colour bleeds through a thin stroke, lower it when a fill escapes the region.
- **Color Mode** — `outline` emits cut lines only; the palette and gradient
  modes fill cells for on-screen or print use.

Settings persist in `localStorage`, and can be exported to and imported from
JSON with the header buttons.

The exported SVG carries no `transform` attributes — affine transforms from the
source are baked into the path coordinates, because LightBurn ignores them.

## Running it standalone

```bash
npm install
npm run dev      # dev server
npm run build    # production build into dist/
npm run preview  # serve the build
```

## Layout

```
index.html        standalone entry
src/main.jsx      mounts App into #root
src/App.jsx       the whole UI; imports app.css
src/geometry.js   flood fill, sampling, Voronoi generation, SVG export
src/app.css       Tailwind v4
```

The site imports `src/App.jsx` directly and never loads `main.jsx`.
