# Folding Boxes

Generates flat blanks for folding storage boxes and exports them as laser-ready
SVG. Set the length, width, height and material thickness, pick a closure, and
the blank is drawn live in the browser. Nothing is uploaded and there is no
backend.

Inspired by the box generator at
[packmyman.com](https://www.packmyman.com/boxes/folding-box), built for a laser
cutter rather than a die.

## The roll end

All three styles share one construction, the FEFCO 0400-series roll end. Each
end of the base carries three panels in a row:

```
lock tabs | return | roll | side wall | BASE
```

The side wall folds up, the narrow roll panel carries it over the top, and the
return panel comes back down inside. Tabs on the free edge of the return drop
through slots cut in the base, just inside the crease. Before the roll closes,
the end flaps of the front and back walls fold inwards and get trapped inside
it, which is what makes the ends three boards thick.

Nothing is glued or taped. The box holds itself together.

The roll panel is two board thicknesses wide and the slots sit one thickness in
from the crease, because that is where the return lands once the end flaps are
inside it. Both follow from the material thickness, so re-export after changing
material rather than scaling an old file.

## Box styles

| Style | Pieces | Closure |
|---|---|---|
| Open tray | one | none; the roll ends lock into the base |
| Locking flap lid | one | the same tray plus a hinged lid whose eared flap tucks inside the front wall |
| Slip-on lid | two | a shallow roll-end tray that slides over the finished base |

The locking flap lid is the FEFCO 0427 mailer. Its blank is the open tray with
two rows added above the back wall: the lid panel, which carries a wing at each
end that drops into the side walls, and the front tuck flap, which carries a
rounded ear at each end. Everything below the lid hinge is identical to the
tray.

## Inside or outside dimensions

The toggle decides what the three numbers mean:

- **Inside** sizes the cavity, for building a box around something.
- **Outside** sizes the finished box, for making it fit into something.

Material thickness drives the conversion. Only the side wall is outside the
cavity — the returns and end flaps are all inside it — so the offsets are:

| Style | Outside length and width | Outside height |
|---|---|---|
| Open tray | inside + 2t | inside + t |
| Locking flap lid | inside + 2t | inside + 2t |
| Slip-on lid | inside + 4t + 2 × slip clearance | inside + 2t |

Both figures are always shown, whichever way round you type them, along with
the sheet size the blank needs so you can check it against the bed.

## Cutting

The SVG is one user unit per millimetre with a millimetre page size, so it
imports at true scale. Two layers:

- `cut` — black, solid
- `fold` — blue, dashed

Send `fold` to your cutter as a score or a light raster pass, not a cut. Piece
names are an optional third `engrave` layer, off by default, and are text
elements rather than outlines, so convert them to paths if your software does
not handle SVG text.

The short cut lines that cross the base creases at each corner are deliberate.
The end flaps and the side walls both hinge on that line and have to be parted
or neither can fold.

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
