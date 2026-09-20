// Build each app with its own toolchain and copy the result into dist.
//
// The site never compiles app source. What ships at /apps/<slug>/run/ is the
// output of that app's own vite build, so the deployed app and the app someone
// copies out of the repo are the same artifact. It is also the only way an app
// can bring its own service worker, which Lead Scanner needs to install and
// work offline at a conference.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = path.join(root, 'apps');
const dist = path.resolve(root, process.argv[2] ?? 'dist');

if (!existsSync(dist)) {
  console.error(`build-apps: ${dist} not found. Run the site build first.`);
  process.exit(1);
}

const apps = readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(path.join(appsDir, e.name, 'package.json')))
  .map((e) => e.name);

for (const slug of apps) {
  const appDir = path.join(appsDir, slug);
  const base = `/apps/${slug}/run/`;
  const out = path.join(dist, 'apps', slug, 'run');

  execFileSync('npm', ['run', 'build', '--workspace', `apps/${slug}`, '--', `--base=${base}`], {
    cwd: root,
    stdio: 'inherit',
  });

  rmSync(out, { recursive: true, force: true });
  cpSync(path.join(appDir, 'dist'), out, { recursive: true });
  console.log(`build-apps: ${slug} -> ${path.relative(root, out)}`);
}

console.log(`build-apps: ${apps.length} apps built and copied.`);
