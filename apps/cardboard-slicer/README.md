# Cardboard Slicer

Turns an STL model into a stack of flat layers you can cut from cardboard and
glue back together. Upload a model, set how tall the finished object should be,
choose a layer thickness or a layer count, and download an SVG nest sized in
millimetres for a laser cutter.

The two 3D viewports show the original mesh next to the layered reconstruction,
so you can see what the chosen thickness costs in fidelity before cutting. The
panel below previews the SVG nest; the downloaded file is the true-to-scale one.

Binary and ASCII STL are both accepted. Each layer is outlined and labelled
`Layer N` in the export so the stack can be assembled in order.

## Run it

```bash
npm install
npm run dev
```

`npm run build` writes a static bundle to `dist/`, and `npm run preview` serves
it. The build uses relative asset paths, so `dist/` works from any URL prefix.
