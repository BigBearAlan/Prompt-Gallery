/**
 * Fetches all prompts from YouMind's internal API.
 * No browser needed — uses direct API calls with light rate limiting.
 *
 * Run:  node scripts/fetch-youmind-api.mjs
 */

import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUTPUT     = path.join(ROOT, 'src', 'data', 'prompts.json');

const API_URL  = 'https://youmind.com/youhome-api/prompts';
const LIMIT    = 18;
const DELAY_MS = 1500; // delay between API pages

// ─── helpers ─────────────────────────────────────────────────────────────────

function detectCategory(text = '') {
  const t = text.toLowerCase();
  if (['portrait','avatar','profile','headshot','selfie','idol','seated','人像','头像'].some(k => t.includes(k))) return 'portrait';
  if (['photo','analog','35mm','film grain','lens','camera','landscape','nature'].some(k => t.includes(k))) return 'photography';
  if (['poster','banner','thumbnail','social media','youtube','flyer','cover','advertisement','海报','缩略图'].some(k => t.includes(k))) return 'poster';
  if (['anime','manga','illustration','cartoon','pixel','3d render','character','game asset','漫画','插画'].some(k => t.includes(k))) return 'illustration';
  if (['ui','interface','app screen','dashboard','mockup','wireframe','live stream','app','网页'].some(k => t.includes(k))) return 'ui';
  if (['infographic','chart','map','diagram','timeline','exploded view','evolutionary','信息图','爆炸图'].some(k => t.includes(k))) return 'infographic';
  if (['logo','brand identity','wordmark'].some(k => t.includes(k))) return 'logo';
  return 'other';
}

function detectLang(text = '') {
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';
  return 'en';
}

function truncate(s = '', n = 80) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadImage(url, dest) {
  if (!url) return false;
  try { await access(dest); return true; } catch {}
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromptGallery/1.0)' },
    });
    if (!res.ok || !res.body) return false;
    await pipeline(res.body, createWriteStream(dest));
    return true;
  } catch { return false; }
}

async function runConcurrent(fns, concurrency = 10) {
  let idx = 0, ok = 0, fail = 0;
  async function worker() {
    while (idx < fns.length) {
      const fn = fns[idx++];
      (await fn()) ? ok++ : fail++;
      if ((ok + fail) % 50 === 0)
        process.stdout.write(`\r  Images ${ok + fail}/${fns.length} (${fail} failed)   `);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write('\n');
  return { ok, fail };
}

// ─── API fetch ─────────────────────────────────────────────────────────────────

async function fetchPage(page) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer':      'https://youmind.com/zh-CN/gpt-image-2-prompts',
      'Accept-Language': 'zh-CN',
    },
    body: JSON.stringify({
      model:      'gpt-image-2',
      page,
      limit:      LIMIT,
      locale:     'zh-CN',
      campaign:   'gpt-image-2-prompts',
      filterMode: 'imageCategories',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 429) {
    return { status: 429, prompts: [], hasMore: true };
  }
  if (!res.ok) {
    throw new Error(`API error: HTTP ${res.status} on page ${page}`);
  }

  const data = await res.json();
  return {
    status: 200,
    prompts:    data.prompts    || [],
    hasMore:    data.hasMore    ?? false,
    total:      data.total      || 0,
    totalPages: data.totalPages || 0,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(IMAGES_DIR, { recursive: true });

  // Load existing data
  let existing = [];
  try {
    existing = JSON.parse(await readFile(OUTPUT, 'utf-8'));
    console.log(`Existing entries: ${existing.length}`);
  } catch { console.log('No existing data found.'); }

  const existingIds = new Set(existing.map(e => e.id));

  // Probe page 1 to learn total
  console.log('Probing API…');
  const probe = await fetchPage(1);
  if (probe.status !== 200) {
    console.error('API returned 429 immediately — still rate limited. Try again in a few minutes.');
    process.exit(1);
  }
  console.log(`Total prompts: ${probe.total}, pages: ${probe.totalPages}, limit: ${LIMIT}`);

  const allRaw = [...probe.prompts];
  let currentPage = 2;
  let retries = 0;
  const maxRetries = 5;

  while (true) {
    await sleep(DELAY_MS);

    process.stdout.write(`\r  Fetching page ${currentPage}/${probe.totalPages} (${allRaw.length} prompts so far)   `);
    const result = await fetchPage(currentPage);

    if (result.status === 429) {
      retries++;
      if (retries > maxRetries) {
        console.log(`\n  Rate limited ${maxRetries} times — stopping.`);
        break;
      }
      const wait = 20000 * retries;
      process.stdout.write(`\r  Rate limited (try ${retries}/${maxRetries}) — waiting ${wait / 1000}s…        `);
      await sleep(wait);
      continue; // retry same page
    }

    retries = 0;
    allRaw.push(...result.prompts);
    currentPage++;

    if (!result.hasMore || currentPage > probe.totalPages + 2) {
      console.log(`\n  Finished fetching all pages.`);
      break;
    }
  }

  console.log(`\nTotal raw prompts fetched: ${allRaw.length}`);

  // Convert to PromptEntry format
  const newEntries = allRaw
    .map(p => {
      const sourceLink = (p.sourceLink || '').split('#')[0];
      const tweetM = sourceLink.match(/status\/(\d+)/);
      if (!tweetM) return null;
      const id = tweetM[1];
      if (existingIds.has(id)) return null;

      const prompt   = p.content || '';
      const lang     = p.language === 'zh' ? 'zh'
                     : p.language === 'ja' ? 'ja'
                     : detectLang(prompt);
      const catText  = (p.title || '') + ' ' + (p.description || '') + ' ' + prompt;
      const cat      = detectCategory(catText);

      const imgs = (p.media || []);
      if (imgs.length === 0) return null;

      return {
        id,
        title:           truncate(p.title || prompt.split('\n')[0] || `Prompt #${p.id}`),
        thumbnail:       imgs[0],
        thumbnailAspect: 1.33,
        author:          p.author?.name || '',
        authorUrl:       p.author?.link || '',
        tags:            [...new Set([lang, cat])],
        category:        cat,
        lang,
        stats:           { likes: p.likes || 0, retweets: 0, views: 0 },
        createdAt:       p.sourcePublishedAt || '',
        prompt,
        outputImages:    imgs,
        sourceUrl:       sourceLink || p.author?.link || '',
        _dl:             imgs.map((url, i) => ({ url, i })),
      };
    })
    .filter(Boolean);

  console.log(`New entries (after dedup): ${newEntries.length}`);

  // Download images
  const tasks = newEntries.flatMap(entry =>
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

  if (tasks.length) {
    console.log(`Downloading ${tasks.length} images…`);
    await runConcurrent(tasks, 8);
  }

  const out = [...existing, ...newEntries]
    .map(({ _dl, ...rest }) => rest)
    .sort((a, b) => b.stats.likes - a.stats.likes);

  await writeFile(OUTPUT, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\n✓ Done — ${out.length} total entries written to src/data/prompts.json`);
  console.log('\nNext steps:');
  console.log('  npm run build');
  console.log('  npx wrangler pages deploy out --project-name prompt-gallery --commit-dirty=true');
}

main().catch(e => { console.error(e); process.exit(1); });
