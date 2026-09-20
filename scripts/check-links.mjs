// Check every internal link in the built site resolves to a real file.
//
// Catches a renamed page, a stale redirect target, and a missing asset before
// they reach production. External links are listed but not fetched.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, process.argv[2] ?? 'dist');

if (!existsSync(dist)) {
  console.error(`check-links: ${dist} not found. Run the build first.`);
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));

const resolves = (target) => {
  const clean = target.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return existsSync(path.join(dist, 'index.html'));

  const asFile = path.join(dist, clean);
  if (existsSync(asFile) && statSync(asFile).isFile()) return true;
  if (existsSync(path.join(asFile, 'index.html'))) return true;
  if (existsSync(`${asFile}.html`)) return true;
  return false;
};

const broken = [];
let checked = 0;
let external = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const from = path.relative(dist, file);

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];

    if (/^(https?:|mailto:|tel:|data:|#|javascript:)/.test(target)) {
      if (target.startsWith('http')) external += 1;
      continue;
    }

    // Only absolute-rooted internal links are unambiguous to verify here.
    if (!target.startsWith('/')) continue;

    checked += 1;
    if (!resolves(target)) broken.push({ from, target });
  }
}

console.log(
  `check-links: ${htmlFiles.length} pages, ${checked} internal links, ${external} external links skipped.`,
);

if (broken.length > 0) {
  console.error(`\ncheck-links: ${broken.length} broken internal links:`);
  for (const { from, target } of broken) console.error(`  ${from} -> ${target}`);
  process.exit(1);
}

console.log('check-links: all internal links resolve.');
