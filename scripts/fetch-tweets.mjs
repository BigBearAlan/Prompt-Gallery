/**
 * Fetch specific tweets and add them to prompts.json.
 * Uses Twitter's public syndication API — no auth needed.
 *
 * Run: node scripts/fetch-tweets.mjs
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatImageMetadataSummary, generateImageMetadata } from './image-metadata.mjs';
import { cleanupPromptText, formatPromptCleanupSummary } from './prompt-cleanup.mjs';
import { detectCategory, truncate } from './gallery-utils.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUTPUT     = path.join(ROOT, 'src', 'data', 'prompts.json');

// ── Tweets to fetch ──────────────────────────────────────────────────────────
const TWEET_URLS = [
  'https://x.com/Lvdouren163/status/2047919218134511765',
  'https://x.com/WooGabriel76263/status/2047919049284214842',
  'https://x.com/cellinlab/status/2047890051820912867',
  'https://x.com/joe_qiao_ai/status/2047848576491888874',
  'https://x.com/xiaoxiaodong01/status/2047714102701883707', 
  'https://x.com/akokoi1/status/2044789531615056175',
  'https://x.com/JiafengS/status/2046723080211587145',
  'https://x.com/liyue_ai/status/2045506567735558336',
  'https://x.com/AbleGPT/status/2047224935144362400',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function extractId(url) {
  const m = url.match(/status\/(\d+)/);
  return m ? m[1] : null;
}

function extractUsername(url) {
  const m = url.match(/x\.com\/([^/]+)\/status/);
  return m ? m[1] : 'unknown';
}

/** Twitter syndication API token (mirrors embed.js formula) */
function syndicationToken(idStr) {
  // Use Number with accepted precision loss — Twitter's check is lenient
  const n = Number(idStr) / 1e15;
  return Math.floor(n * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function detectLang(text = '') {
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';
  return 'en';
}

/** Strip t.co links and leading/trailing whitespace from tweet text */
function cleanText(text = '') {
  return text
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function downloadImage(url, dest) {
  if (existsSync(dest)) return true;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromptGallery/1.0)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok || !res.body) return false;
    await pipeline(res.body, createWriteStream(dest));
    return true;
  } catch (e) {
    console.error(`  ✗ Image download failed: ${e.message}`);
    return false;
  }
}

// ── Tweet fetching ───────────────────────────────────────────────────────────

async function fetchTweet(id) {
  const token = syndicationToken(id);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://platform.twitter.com/',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for tweet ${id}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`  Fetch error for tweet ${id}: ${e.message}`);
    return null;
  }
}

/** Extract photo URLs from the syndication response */
function extractImages(data) {
  const imgs = [];

  // Format A: data.photos
  if (Array.isArray(data.photos)) {
    for (const p of data.photos) {
      const base = p.url || p.media_url_https;
      if (base) imgs.push(`${base}?format=jpg&name=large`);
    }
  }

  // Format B: data.mediaDetails
  if (Array.isArray(data.mediaDetails)) {
    for (const m of data.mediaDetails) {
      if (m.type === 'photo') {
        const base = m.media_url_https || m.media_url;
        if (base) imgs.push(`${base}?format=jpg&name=large`);
      }
    }
  }

  return imgs;
}

/** Compute aspect ratio (height/width) from syndication data */
function getAspect(data) {
  const src =
    (Array.isArray(data.photos) && data.photos[0]) ||
    (Array.isArray(data.mediaDetails) && data.mediaDetails[0]) ||
    null;
  if (!src) return 1.33;
  const w = src.width  || src.original_info?.width  || 0;
  const h = src.height || src.original_info?.height || 0;
  return w > 0 && h > 0 ? parseFloat((h / w).toFixed(4)) : 1.33;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(IMAGES_DIR, { recursive: true });

  const existing = JSON.parse(await readFile(OUTPUT, 'utf-8'));
  const existingIds = new Set(existing.map(e => e.id));
  console.log(`Existing entries: ${existing.length}`);

  const newEntries = [];

  for (const tweetUrl of TWEET_URLS) {
    const id       = extractId(tweetUrl);
    const username = extractUsername(tweetUrl);
    if (!id) { console.warn(`⚠  Could not extract ID from ${tweetUrl}`); continue; }

    if (existingIds.has(id)) {
      console.log(`  skip  ${id}  (already in gallery)`);
      continue;
    }

    process.stdout.write(`  fetch ${id}  (@${username}) … `);
    const data = await fetchTweet(id);

    if (!data) { console.log('FAILED'); continue; }

    const rawText  = data.text || data.full_text || '';
    const cleanedText = cleanText(rawText);
    const author   = data.user?.name || data.core?.user_results?.result?.legacy?.name || username;
    const imageUrls = extractImages(data);

    if (imageUrls.length === 0) {
      console.log(`NO IMAGES — skipping (prompt: "${cleanedText.slice(0, 60)}")`);
      continue;
    }

    const cleanup  = await cleanupPromptText(cleanedText, { root: ROOT });
    const prompt   = cleanup.cleanedPrompt;
    const promptBasis = `${prompt || cleanedText}`.trim();
    const lang     = detectLang(promptBasis);
    const fallbackCategory = detectCategory(promptBasis);
    const fallbackTitle    = truncate(cleanedText.split('\n')[0] || `Tweet by @${username}`, 80);
    const likes    = data.favorite_count ?? 0;
    const retweets = data.retweet_count  ?? 0;
    const views    = data.views?.count   ? Number(data.views.count) : 0;
    const aspect   = getAspect(data);

    // Download images
    const localImages = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const dest    = path.join(IMAGES_DIR, `${id}_${i}.jpg`);
      const webPath = `/images/${id}_${i}.jpg`;
      const ok = await downloadImage(imageUrls[i], dest);
      localImages.push(ok ? webPath : imageUrls[i]);
    }

    const entry = {
      id,
      title:           fallbackTitle,
      thumbnail:       localImages[0],
      thumbnailAspect: aspect,
      author,
      authorUrl:       `https://x.com/${username}`,
      tags:            [],
      category:        fallbackCategory,
      lang,
      stats:           { likes, retweets, views },
      createdAt:       data.created_at || '',
      prompt,
      outputImages:    localImages,
      sourceUrl:       tweetUrl,
      pending:         true,
    };

    const imageMetadata = await generateImageMetadata(entry, { root: ROOT });
    entry.title = imageMetadata.title || fallbackTitle;
    entry.category = imageMetadata.category || fallbackCategory;
    entry.tags = [...new Set([lang, entry.category !== 'other' ? entry.category : undefined].filter(Boolean))];

    newEntries.push(entry);
    console.log(`OK  (${imageUrls.length} img, cat: ${entry.category}, lang: ${lang})`);
    console.log(`      title: ${entry.title}`);
    console.log(`      ${formatPromptCleanupSummary(cleanup)}`);
    console.log(`      ${formatImageMetadataSummary(imageMetadata)}`);

    await new Promise(r => setTimeout(r, 800)); // gentle rate-limit
  }

  if (newEntries.length === 0) {
    console.log('\nNo new entries to add.');
    return;
  }

  const out = [...existing, ...newEntries];
  await writeFile(OUTPUT, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\n✓ Added ${newEntries.length} entries → ${out.length} total in prompts.json`);
  console.log('\nNext step: review and deploy via admin panel, or run:');
  console.log('  npm run build && git add src/data/prompts.json public/images/ && git commit -m "chore: update prompts data via admin" && git push origin main');
}

main().catch(e => { console.error(e); process.exit(1); });
