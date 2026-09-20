---
title: Voronoi Shapes
tagline: Generate Voronoi patterns inside SVG regions using flood-fill selection.
screenshot: ../../assets/apps/voronoi-shapes.png
screenshotAlt: >-
  The Voronoi Shapes app with a heart, star and hexagon outline each flood-filled with a generated Voronoi cell pattern in pastel colors, above the laser-cut settings panel.
source: https://github.com/KyleJamesWalker/KyleJamesWalker.github.io/tree/main/apps/voronoi-shapes
featured: true
order: 3
tags: [SVG, generative, laser cutting]
---

Load an SVG, click the regions you want filled, and the app packs a Voronoi
pattern into exactly those areas. Useful for turning a solid shape into
something a laser cutter can cut without the middle falling out.

## How it works

Selection is a flood fill, so you click a region rather than tracing it. The
cell density, the margin at the region edge and the stroke width are all
adjustable, and the result exports as SVG with the cells as real paths.

## Notes

- Settings persist in the browser between visits.
- Very high cell counts get slow to render before they get slow to cut. Start
  low and work up.
