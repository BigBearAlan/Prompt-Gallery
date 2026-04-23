/**
 * Fetches and merges prompt data from two sources:
 *   1. EvoLinkAI/awesome-gpt-image-2-prompts  (Twitter JSON)
 *   2. YouMind-OpenLab/awesome-gpt-image-2     (README.md)
 *
 * Downloads all images to public/images/ and writes src/data/prompts.json.
 * Run:  node scripts/sync-data.mjs
 * CF Pages build command:  node scripts/sync-data.mjs && next build
 */

import { writeFile, mkdir, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyCuration,
  detectCategory,
  ensureUniqueEntryIds,
  extractTags,
  loadCuration,
  mapYouMindSection,
  truncate,
} from './gallery-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUTPUT     = path.join(ROOT, 'src', 'data', 'prompts.json');
const CURATION   = path.join(ROOT, 'src', 'data', 'curation.json');

const TWITTER_URL = 'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-prompts/main/gpt_image2_prompts.json';
const YOUMIND_URL = 'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README.md';

// ─── Source 1: Twitter JSON ───────────────────────────────────────────────────

async function fetchTwitterSource() {
  process.stdout.write('Fetching Twitter JSON source… ');
  const res = await fetch(TWITTER_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  console.log(`${raw.length} tweets`);

  return raw
    .filter(t => t.media?.some(m => m.type === 'photo'))
    .map(t => {
      const photos = t.media.filter(m => m.type === 'photo');
      const thumb  = photos[0];
      const lang   = t.lang || 'en';
      const cat    = detectCategory(t.text);
      const firstLine = t.text.split('\n')[0].replace(/\{.*/, '').trim();
      return {
        id:              t.id,
        title:           truncate(firstLine || t.text),
        thumbnail:       thumb.url,
        thumbnailAspect: parseFloat((thumb.height / thumb.width).toFixed(3)),
        author:          t.author,
        authorUrl:       t.url,
        tags:            extractTags(t.text, lang, cat),
        category:        cat,
        lang,
        stats:           { likes: t.likeCount, retweets: t.retweetCount, views: t.viewCount },
        createdAt:       t.createdAt,
        prompt:          t.text,
        outputImages:    photos.map(p => p.url),
        sourceUrl:       t.url,
        _dl: photos.map((p, i) => ({ url: p.url, i })),
      };
    });
}

// ─── Source 2: YouMind README ─────────────────────────────────────────────────

function parseYouMindBlock(block) {
  const headingMatch = block.match(/^### No\. (\d+): (.+)$/m);
  if (!headingMatch) return null;

  const blockNo = headingMatch[1];
  const fullTitle = headingMatch[2].trim();
  let category = 'other';
  let title    = fullTitle;

  // "Category - Title" pattern
  const catTitle = fullTitle.match(/^(.+?) - (.+)$/);
  if (catTitle) {
    category = mapYouMindSection(catTitle[1]);
    title    = catTitle[2].trim();
  } else {
    category = detectCategory(fullTitle);
  }

  // Language badge
  const langM = block.match(/Language-([A-Z]{2})/i);
  const lang  = langM ? langM[1].toLowerCase() : 'en';

  // Prompt (fenced code block after the 📝 Prompt heading)
  const promptM = block.match(/####\s*📝 Prompt\s*\n```[^\n]*\n([\s\S]*?)```/);
  if (!promptM) return null;
  const prompt = promptM[1].trim();

  // Images
  const imgs = [...block.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]);
  if (imgs.length === 0) return null;

  // Author
  const authorM = block.match(/\*\*Author:\*\* \[([^\]]+)\]\(([^)]+)\)/);
  const author    = authorM ? authorM[1] : 'Unknown';
  const authorUrl = authorM ? authorM[2] : '';

  // Source
  const srcM     = block.match(/\*\*Source:\*\* \[(?:Twitter Post|Source)\]\(([^)]+)\)/);
  const sourceUrl = srcM ? srcM[1] : authorUrl;

  // Date
  const dateM    = block.match(/\*\*Published:\*\* (.+)$/m);
  const createdAt = dateM ? dateM[1].trim() : '';

  // Stable ID: YouMind can publish several cards from one tweet, so prefer its
  // own block/item ID and keep the tweet ID as sourceId for traceability.
  const tweetM = (sourceUrl || '').match(/status\/(\d+)/);
  const ymM    = block.match(/youmind\.com\/gpt-image-2-prompts\?id=(\d+)/);
  const id     = ymM ? `ym${ymM[1]}` : tweetM ? tweetM[1] : `ym-no-${blockNo}`;
  if (!id) return null;

  const featured = block.includes('⭐');

  return {
    id,
    title:           truncate(title),
    thumbnail:       imgs[0],
    thumbnailAspect: 1.33,
    author,
    authorUrl,
    tags:            [...new Set([lang, category, ...(featured ? ['featured'] : [])])],
    category,
    lang,
    stats:           { likes: featured ? 500 : 0, retweets: 0, views: 0 },
    createdAt,
    prompt,
    outputImages:    [...imgs],
    sourceUrl,
    sourceId:        tweetM ? tweetM[1] : undefined,
    _dl: imgs.map((url, i) => ({ url, i })),
  };
}

async function fetchYouMindSource() {
  process.stdout.write('Fetching YouMind README… ');
  const res = await fetch(YOUMIND_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  const blocks = text.split(/\n---\n/).filter(b => /### No\. \d+:/.test(b));
  console.log(`${blocks.length} blocks found`);

  const entries = [];
  for (const block of blocks) {
    const e = parseYouMindBlock(block);
    if (e) entries.push(e);
  }
  console.log(`YouMind: ${entries.length} valid entries parsed`);
  return entries;
}

// ─── Image download ───────────────────────────────────────────────────────────

async function downloadImage(url, dest) {
  try { await access(dest); return true; } catch {}
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(25000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromptGallery/1.0)' },
    });
    if (!res.ok || !res.body) return false;
    await pipeline(res.body, createWriteStream(dest));
    return true;
  } catch {
    return false;
  }
}

async function runConcurrent(fns, concurrency = 10) {
  let idx = 0, ok = 0, fail = 0;
  async function worker() {
    while (idx < fns.length) {
      const fn = fns[idx++];
      (await fn()) ? ok++ : fail++;
      if ((ok + fail) % 100 === 0)
        process.stdout.write(`\r  Images: ${ok + fail}/${fns.length} (${fail} failed)   `);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\n  Total: ${ok} downloaded, ${fail} failed`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(IMAGES_DIR, { recursive: true });

  const [twitter, youmind] = await Promise.all([
    fetchTwitterSource().catch(e => { console.error('Twitter error:', e.message); return []; }),
    fetchYouMindSource().catch(e => { console.error('YouMind error:', e.message); return []; }),
  ]);

  // Merge by generated entry ID.
  const seen = new Set();
  const all  = [];
  for (const entry of [...twitter, ...youmind]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    all.push(entry);
  }
  console.log(`Merged: ${all.length} unique entries`);

  const { entries: uniqueAll, stats: uniqueIdStats } = ensureUniqueEntryIds(all);
  if (uniqueIdStats.idsChanged) {
    console.log(
      `IDs: made ${uniqueIdStats.idsChanged} duplicate IDs unique across ` +
      `${uniqueIdStats.duplicateIdGroups} source ID groups`
    );
  }

  const curation = await loadCuration(CURATION);
  const { entries: curatedAll, stats: curationStats } = applyCuration(uniqueAll, curation);
  if (
    curationStats.hidden ||
    curationStats.categoryOverrides ||
    curationStats.titleOverrides ||
    curationStats.tagChanges
  ) {
    console.log(
      `Curation: hid ${curationStats.hidden}, category overrides ${curationStats.categoryOverrides}, ` +
      `title overrides ${curationStats.titleOverrides}, tag changes ${curationStats.tagChanges}`
    );
  }

  // Build download tasks — update entry URLs in-place on success
  const tasks = curatedAll.flatMap(entry =>
    (entry._dl || []).map(({ url, i }) => async () => {
      const dest    = path.join(IMAGES_DIR, `${entry.id}_${i}.jpg`);
      const webPath = `/images/${entry.id}_${i}.jpg`;
      const ok      = await downloadImage(url, dest);
      if (ok) {
        entry.outputImages[i] = webPath;
        if (i === 0) entry.thumbnail = webPath;
      }
      return ok;
    })
  );

  console.log(`Downloading ${tasks.length} images with concurrency=10…`);
  await runConcurrent(tasks, 10);

  // Strip internal field, sort by likes
  const out = curatedAll
    .map(({ _dl, ...rest }) => rest)
    .sort((a, b) => b.stats.likes - a.stats.likes);

  await writeFile(OUTPUT, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`✓ Written ${out.length} entries → ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
