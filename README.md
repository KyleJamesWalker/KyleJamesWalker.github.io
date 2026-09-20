# kylejameswalker.com

Personal site: browser apps you can run here, and open source projects on
GitHub. Built with Astro, React and Tailwind, deployed to GitHub Pages.

## Develop

```bash
npm install
npm run dev              # the site, at http://localhost:4321
npm run dev -w apps/folding-boxes   # one app, on its own
```

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Site, then every app, then the zine minify, into `dist/` |
| `npm run preview` | Serve the built site |
| `npm test` | Run every app's tests |
| `npm run check:portable` | Copy each app out of the repo and build it |
| `npm run check:links` | Verify internal links in `dist/` resolve |
| `npm run build:zine` | Just the zine minify step, against an existing `dist/` |

## Layout

```
src/
  content/apps/*.md    one file per app: card copy plus landing page prose
  data/projects.yml    the repo list on /projects/
  pages/               routes
  components/          site UI
  styles/global.css    Dracula theme tokens
apps/<slug>/           standalone Vite projects, see apps/README.md
public/                static files served as-is, including the zine app
```

## Adding things

**An app.** Create `apps/<slug>/` following the contract in
[`apps/README.md`](apps/README.md) and add `src/content/apps/<slug>.md`. The
build picks the app up automatically and serves it at `/apps/<slug>/run/`.

**A project.** Add an entry to `src/data/projects.yml`. The `language` value
must be a key in `languageColors` in `src/site.ts`, or the build fails.

Headline, tagline, bio and links live in `src/site.ts`.

## Apps are not locked to this site

Every directory under `apps/` is a complete Vite project. Copy one anywhere,
run `npm install && npm run dev`, and it works with nothing of this site
attached. CI enforces this on every push.

The site does not compile app code. Each app is built by its own toolchain and
the output is copied into `dist/`, so what is deployed and what you get from
copying the folder out are the same artifact. See
[`apps/README.md`](apps/README.md).
