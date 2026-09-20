---
title: Folding Boxes
tagline: Generate laser-cut templates for folding storage boxes.
screenshot: ../../assets/apps/folding-boxes.png
screenshotAlt: >-
  The Folding Boxes app showing a flat cardboard die-line for a 200 x 140 x 60 mm locking-flap-lid box, with cut and score lines marked and fold-up instructions below.
source: https://github.com/KyleJamesWalker/KyleJamesWalker.github.io/tree/main/apps/folding-boxes
featured: true
order: 1
tags: [laser cutting, cardboard, SVG]
---

Set a length, a width and a height, and the app draws a flat template that
folds into a rigid box. Cut it on a laser cutter or by hand, score the fold
lines, and fold it up. Nothing is uploaded and nothing is stored.

## How it works

The template is a single closed outline plus a set of score lines. Cut the
outline, score everything inside it, then fold along the scores. The tabs
taper so they clear each other as the walls come up.

The ends are rolled rather than glued at the corners. A rolled end wraps the
material back on itself, which gives a box that holds its shape without
adhesive and survives being emptied and refilled.

## Notes

- Dimensions are in millimeters, and every field is labeled with its unit.
- Material thickness matters. A fold needs about one thickness of clearance,
  so a 3 mm board and a 1 mm board do not produce the same template.
- Export is plain SVG. Any cutter or drawing program will open it.
