// Minify the Dirty Little Zine Plus app into the built site.
//
// Runs against _site AFTER jekyll build and never touches the source tree. The
// app deliberately has no build step of its own and must stay runnable by
// pointing any static server at its directory, so the repo keeps readable,
// commented source and only the deployed copy is bundled.

import { build } from 'esbuild';
import { readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const APP = 'applications/dirty-little-zine-plus';
const site = process.argv[2] || '_site';
const out = path.join(site, APP);

if (!existsSync(out)) {
  console.error(`minify-zine: ${out} not found. Run the Jekyll build first.`);
  process.exit(1);
}

const sizeOf = async p => (existsSync(p) ? (await stat(p)).size : 0);

const before =
  (await readdir(path.join(out, 'js')).then(fs =>
    Promise.all(fs.map(f => sizeOf(path.join(out, 'js', f)))))).reduce((a, b) => a + b, 0) +
  (await sizeOf(path.join(out, 'style.css')));

// One entry pulls in every module, so the individual files become dead weight
// in the output and are removed below.
await build({
  entryPoints: [path.join(APP, 'js/app.js')],
  outfile: path.join(out, 'js/app.js'),
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
  allowOverwrite: true,
});

await build({
  entryPoints: [path.join(APP, 'style.css')],
  outfile: path.join(out, 'style.css'),
  minify: true,
  allowOverwrite: true,
});

for (const f of await readdir(path.join(out, 'js'))) {
  if (f !== 'app.js') await rm(path.join(out, 'js', f));
}

// Repo documentation, not site content.
await rm(path.join(out, 'README.md'), { force: true });

const after = (await sizeOf(path.join(out, 'js/app.js'))) + (await sizeOf(path.join(out, 'style.css')));
const pct = Math.round((1 - after / before) * 100);
console.log(`minify-zine: ${(before / 1024).toFixed(1)}kB -> ${(after / 1024).toFixed(1)}kB (-${pct}%)`);
