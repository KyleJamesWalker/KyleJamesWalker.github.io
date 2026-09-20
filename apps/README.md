# Apps

Each directory here is a standalone Vite project. The site hosts them, but does
not own them and does not compile them.

Copy any directory out of this repo, run `npm install && npm run dev`, and it
works. CI enforces this. See `scripts/check-portable.mjs`.

## The contract

Every app directory has this shape:

```
<slug>/
  index.html          entry
  package.json        complete dependency list, no workspace-only deps
  vite.config.js
  README.md
  src/
    App.jsx
    main.jsx          mounts into #root
    app.css           Tailwind v4
```

Three rules keep the contract true:

1. **No import may leave the app directory.** No site components, no shared
   config, no relative path reaching outside `<slug>/`.
2. **`package.json` lists every dependency the app uses.** npm workspaces hoist
   packages into the root `node_modules`, so a missing entry still runs here and
   fails the moment the folder is copied out. This is the failure the CI check
   exists to catch.
3. **Styling is self-describing.** Tailwind v4 declares sources and theme inside
   `app.css`. There is no root `tailwind.config.js` and no root PostCSS config
   to inherit.

## How the site hosts an app

`scripts/build-apps.mjs` runs each app's own vite build with
`--base=/apps/<slug>/run/` and copies the output to `dist/apps/<slug>/run/`.
The site build never reads app source.

What ships is the artifact the app's own toolchain produced. An app can use any
build setup, any framework version, or no framework at all, and it can bring
its own service worker. Lead Scanner needs one so it installs to a phone and
keeps working when the conference wifi does not.

Dirty Little Zine Plus has no build step at all. It is plain files served from
`public/apps/dirty-little-zine-plus/run/`, and the same rules apply to it.

## Development

The site's dev server does not serve the apps, because the apps are built
artifacts rather than site pages. Work on an app on its own:

```bash
npm run dev -w apps/folding-boxes
```

Run from the repository root:

```bash
npm test                    # every app's tests
npm run check:portable      # copy each app out and build it
npm run build               # the site, then every app, into dist/
```
