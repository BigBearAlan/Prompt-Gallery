/**
 * Fetches prompt data from the awesome-gpt-image-2-prompts repo,
 * downloads images to public/images/, and writes processed prompts
 * to src/data/prompts.json.
 *
 * Run: node scripts/sync-data.mjs
 * Cloudflare Pages build command: node scripts/sync-data.mjs && next build
 */

import { writeFile, mkdir, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUTPUT = path.join(ROOT, 'src', 'data', 'prompts.json');

const RAW_URL =
  'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-prompts/main/gpt_image2_prompts.json';

const CATEGORY_KEYWORDS = {
  portrait: ['portrait', 'face', 'headshot', 'idol', 'girl', 'woman', 'man', 'korean', 'japanese female', 'selfie'],
  photography: ['photo', 'photograph', 'camera', '35mm', 'film grain', 'analog', 'lens', 'bokeh', 'fujifilm', 'ccd'],
  poster: ['poster', 'movie', 'film', 'banner', 'cover', 'album', 'advertisement', '海报', 'ポスター'],
  illustration: ['illustration', 'painting', 'watercolor', 'ink', 'art', 'anime', 'cartoon', 'manga', '水墨', 'イラスト'],
  ui: ['ui', 'interface', 'app', 'screen', 'dashboard', 'website', 'button', 'icon', 'ステータス画面', '界面'],
  infographic: ['infographic', 'chart', 'info', '科普', '信息图', 'information'],
  logo: ['logo', 'brand', 'identity', 'symbol', 'wordmark'],
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'other';
}

function extractTags(text, lang, category) {
  const tags = new Set([lang]);
  if (category !== 'other') tags.add(category);

  // Extract hashtags
  const hashtags = text.match(/#(\w+)/g) || [];
  for (const tag of hashtags) {
    const t = tag.slice(1).toLowerCase();
    if (t.length > 1 && t.length < 20) tags.add(t);
  }

  // Common English keywords
  const enKeywords = ['portrait', 'photography', 'analog', 'film', 'idol', 'editorial', 'fujifilm', 'CCD', 'grid'];
  for (const kw of enKeywords) {
    if (text.toLowerCase().includes(kw.toLowerCase())) tags.add(kw.toLowerCase());
  }

  return [...tags].slice(0, 8);
}

function makeTitle(text) {
  const first = text.split('\n')[0].replace(/\{.*/, '').trim();
  if (!first) return text.slice(0, 60);
  return first.length > 70 ? first.slice(0, 67) + '...' : first;
}

async function downloadImage(url, dest) {
  // Skip if already downloaded
  try {
    await access(dest);
    return true;
  } catch {
    // file doesn't exist, download it
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromptGallery/1.0)' },
    });
    if (!res.ok || !res.body) return false;
    await pipeline(res.body, createWriteStream(dest));
    return true;
  } catch (err) {
    console.warn(`  Failed to download ${url}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('Fetching prompt data from GitHub...');
  const res = await fetch(RAW_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const raw = await res.json();

  console.log(`Found ${raw.length} entries. Filtering for photo entries...`);

  const withPhotos = raw.filter(
    (t) => t.media?.some((m) => m.type === 'photo')
  );
  console.log(`${withPhotos.length} entries have photos.`);

  await mkdir(IMAGES_DIR, { recursive: true });

  const processed = [];
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < withPhotos.length; i++) {
    const t = withPhotos[i];
    const photos = t.media.filter((m) => m.type === 'photo');
    const thumb = photos[0];

    if (i % 10 === 0) {
      process.stdout.write(`\r  Processing ${i + 1}/${withPhotos.length}...`);
    }

    const category = detectCategory(t.text);
    const tags = extractTags(t.text, t.lang, category);

    // Build image paths — try local first
    const localPaths = photos.map((_, idx) =>
      path.join(IMAGES_DIR, `${t.id}_${idx}.jpg`)
    );
    const webPaths = photos.map((_, idx) => `/images/${t.id}_${idx}.jpg`);

    // Download first image (thumbnail) only
    const thumbDest = localPaths[0];
    const ok = await downloadImage(thumb.url, thumbDest);
    if (ok) {
      downloaded++;
    } else {
      failed++;
    }

    // Download remaining images (best-effort, non-blocking)
    for (let j = 1; j < photos.length; j++) {
      await downloadImage(photos[j].url, localPaths[j]).catch(() => {});
    }

    processed.push({
      id: t.id,
      title: makeTitle(t.text),
      // Use local path if download succeeded, CDN URL as fallback
      thumbnail: ok ? webPaths[0] : thumb.url,
      thumbnailAspect: parseFloat((thumb.height / thumb.width).toFixed(3)),
      author: t.author,
      authorUrl: t.url,
      tags,
      category,
      lang: t.lang,
      stats: {
        likes: t.likeCount,
        retweets: t.retweetCount,
        views: t.viewCount,
      },
      createdAt: t.createdAt,
      prompt: t.text,
      outputImages: photos.map((p, idx) => {
        const dest = localPaths[idx];
        // We can't know synchronously if subsequent images downloaded, use web path
        return webPaths[idx];
      }),
      sourceUrl: t.url,
    });
  }

  console.log(`\nDownloaded: ${downloaded}, Failed: ${failed}`);

  // Sort by likes descending
  processed.sort((a, b) => b.stats.likes - a.stats.likes);

  await writeFile(OUTPUT, JSON.stringify(processed, null, 2), 'utf-8');
  console.log(`Written ${processed.length} entries to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
