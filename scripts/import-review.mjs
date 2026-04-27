/**
 * Imports approved candidates from tmp/review.json into prompts.json.
 * Entries with _keep: false are skipped.
 *
 * Run: node scripts/import-review.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectCategory } from './gallery-utils.mjs';
import { cleanupEntries, formatPromptCleanupSummary } from './prompt-cleanup.mjs';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const ROOT         = path.resolve(__dirname, '..');
const REVIEW_FILE  = path.join(ROOT, 'tmp', 'review.json');
const PROMPTS_FILE = path.join(ROOT, 'src', 'data', 'prompts.json');

function detectLang(text = '') {
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';
  return 'en';
}

function updateTags(entry) {
  const baseTags = (entry.tags || []).filter((tag) => tag !== entry.lang && tag !== entry.category);
  entry.tags = [...new Set([entry.lang, entry.category, ...baseTags])];
}

async function main() {
  const candidates = JSON.parse(await readFile(REVIEW_FILE, 'utf-8'));
  const keepers    = candidates.filter(c => c._keep !== false);
  const skipped    = candidates.length - keepers.length;

  console.log(`Candidates: ${candidates.length}  |  Keep: ${keepers.length}  |  Skip: ${skipped}`);

  const existing   = JSON.parse(await readFile(PROMPTS_FILE, 'utf-8'));
  const existingIds = new Set(existing.map(e => e.id));

  const toAdd = keepers
    .filter(c => !existingIds.has(c.id))
    .map(({ _keep, authorHandle, imageCount, views, likes, ...entry }) => ({
      ...entry,
      pending: true,  // hidden from public gallery until reviewed in admin
      stats: entry.stats || { likes: likes ?? 0, retweets: 0, views: views ?? 0 },
    }));

  if (toAdd.length === 0) {
    console.log('Nothing new to add (all already in gallery or all skipped).');
    return;
  }

  await cleanupEntries(toAdd, {
    root: ROOT,
    onProgress(entry, result, index, total) {
      console.log(`Prompt cleanup ${index}/${total} ${entry.id}: ${formatPromptCleanupSummary(result)}`);
    },
  });

  for (const entry of toAdd) {
    delete entry.aiReview;
    const classificationText = `${entry.prompt || entry.title || ''}`.trim();
    entry.lang = detectLang(classificationText);
    entry.category = detectCategory(classificationText);
    updateTags(entry);
  }

  const out = [...existing, ...toAdd];
  await writeFile(PROMPTS_FILE, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\n✓ Staged ${toAdd.length} entries as pending → open admin portal "待发布" tab to review`);
  console.log('\nNext: node scripts/admin.mjs → http://localhost:3001');
}

main().catch(e => { console.error(e); process.exit(1); });
