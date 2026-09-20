// Prove every app still runs outside this repository.
//
// Copies each apps/<slug> to a temp directory beyond the workspace root,
// installs from its own package.json, and builds. npm workspaces hoist
// dependencies into the root node_modules, so an app that forgot to declare
// one still builds in place and fails the moment it is copied out. That is the
// failure this catches.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = path.join(root, 'apps');

const only = process.argv.slice(2);
const apps = readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(path.join(appsDir, name, 'package.json')))
  .filter((name) => only.length === 0 || only.includes(name));

if (apps.length === 0) {
  console.error('check-portable: no apps found');
  process.exit(1);
}

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });

let failed = 0;

for (const app of apps) {
  const scratch = mkdtempSync(path.join(tmpdir(), `portable-${app}-`));
  const dest = path.join(scratch, app);

  try {
    cpSync(path.join(appsDir, app), dest, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|dist)$/.test(src),
    });

    run('npm', ['install', '--no-audit', '--fund=false'], dest);
    run('npm', ['run', 'build'], dest);
    console.log(`  ok    ${app}`);
  } catch (err) {
    failed += 1;
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    console.error(`  FAIL  ${app}`);
    console.error(detail.split('\n').slice(-25).map((l) => `        ${l}`).join('\n'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error(
    `\ncheck-portable: ${failed} of ${apps.length} apps cannot build outside the repo.`,
  );
  console.error('See apps/README.md for the contract.');
  process.exit(1);
}

console.log(`\ncheck-portable: all ${apps.length} apps build standalone.`);
