#!/usr/bin/env node
/**
 * Splits src/data/prompts.json into fixed-size chunks under public/data/
 * and copies image-quality.json so both can be fetched client-side.
 *
 * Runs automatically via the "prebuild" npm script.
 * Skip rebuild if the source file is older than the existing manifest.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SRC_PROMPTS = path.join(root, 'src/data/prompts.json');
const SRC_QUALITY  = path.join(root, 'src/data/image-quality.json');
const OUT_DIR      = path.join(root, 'public/data');
const MANIFEST     = path.join(OUT_DIR, 'manifest.json');
const CHUNK_SIZE   = 300;

// Skip if chunks are already up-to-date
if (fs.existsSync(MANIFEST)) {
  const srcMtime      = fs.statSync(SRC_PROMPTS).mtimeMs;
  const manifestMtime = fs.statSync(MANIFEST).mtimeMs;
  if (srcMtime < manifestMtime) {
    console.log('public/data is up-to-date, skipping chunk rebuild.');
    process.exit(0);
  }
}

console.log('Building public/data chunks…');

const all    = JSON.parse(fs.readFileSync(SRC_PROMPTS, 'utf8'));
const active = all.filter(e => !e.pending);

// Sort: hq first, then by likes — so chunk-001 always has the best content.
active.sort((a, b) => {
  if (a.hq && !b.hq) return -1;
  if (!a.hq && b.hq)  return  1;
  return (b.stats?.likes || 0) - (a.stats?.likes || 0);
});

fs.mkdirSync(OUT_DIR, { recursive: true });

let chunkCount = 0;
for (let i = 0; i < active.length; i += CHUNK_SIZE) {
  chunkCount++;
  const chunk    = active.slice(i, i + CHUNK_SIZE);
  const filename = `chunk-${String(chunkCount).padStart(3, '0')}.json`;
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(chunk));
  console.log(`  ${filename}: ${chunk.length} entries`);
}

fs.writeFileSync(MANIFEST, JSON.stringify({
  total:     active.length,
  chunks:    chunkCount,
  chunkSize: CHUNK_SIZE,
}));

fs.copyFileSync(SRC_QUALITY, path.join(OUT_DIR, 'image-quality.json'));

console.log(`Done: ${active.length} entries → ${chunkCount} chunks + image-quality.json`);
