# Folding Boxes

Generates flat blanks for folding storage boxes and exports them as laser-ready
SVG. Set the length, width, height and material thickness, pick a closure, and
the blank is drawn live in the browser. Nothing is uploaded and there is no
backend.

Inspired by the box generator at
[packmyman.com](https://www.packmyman.com/boxes/folding-box), built for a laser
cutter rather than a die.

## Box styles

| Style | Pieces | Closure |
|---|---|---|
| Open tray | one | none; four walls fold up, corner tabs glue inside |
| Locking flap lid | one | hinged lid, tuck flap locks into slots at the front crease |
| Slip-on lid | two | shallow lid tray slides over the finished base |

The locking flap lid follows FEFCO 0427, a tray with a hinged lid whose outer
flap tucks into slots on the front wall. It differs from the commercial dieline
in one respect: the end walls here are single-wall with glue tabs rather than
triple-wall roll ends, because a roll end needs three creases inside two board
thicknesses and that is unreliable on a laser rather than a die.

## Inside or outside dimensions

The toggle decides what the three numbers mean:

- **Inside** sizes the cavity, for building a box around something.
- **Outside** sizes the finished box, for making it fit into something.

Material thickness drives the conversion, and each style stacks material
differently, so the offsets differ per style:

| Style | Outside length and width | Outside height |
|---|---|---|
| Open tray | inside + 2t | inside + t |
| Locking flap lid | inside + 2t | inside + 2t |
| Slip-on lid | inside + 4t + 2 × slip clearance | inside + 2t |

Both figures are always shown, whichever way round you type them, along with the
sheet size the blank needs so you can check it against the bed.

## Cutting

The SVG is one user unit per millimetre with a millimetre page size, so it
imports at true scale. Two layers:

- `cut` — black, solid
- `fold` — blue, dashed

Send `fold` to your cutter as a score or a light raster pass, not a cut. Piece
names are an optional third `engrave` layer, off by default, and are text
elements rather than outlines, so convert them to paths if your software does
not handle SVG text.

Thickness also sizes the lock slots and the slip clearance, so re-export after
changing material rather than scaling an old file.

## Development

The blank geometry lives in `geometry.js` with no React or DOM dependency, which
keeps it testable on its own:

```sh
npm test
```

The app is built with the rest of the site's Vite entry points:

```sh
npm run build
```
