/**
 * Scrapes all prompts from youmind.com using a real Chromium browser.
 *
 * Prerequisites (run once):
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Then run:
 *   node scripts/scrape-youmind.mjs
 *
 * After it finishes:
 *   npm run build
 *   npx wrangler pages deploy out --project-name prompt-gallery --commit-dirty=true
 */

import { chromium } from 'playwright';
import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUTPUT     = path.join(ROOT, 'src', 'data', 'prompts.json');
const TARGET_URL = 'https://youmind.com/zh-CN/gpt-image-2-prompts';
const TARGET     = 1100;

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

function extractOriginalImageUrl(src = '') {
  const match = src.match(/\/cdn-cgi\/image\/[^/]+\/(.+)/);
  if (!match) return src;
  try { return decodeURIComponent(match[1]); } catch { return src; }
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

// ─── in-browser extraction (runs inside page.evaluate) ───────────────────────

function extractCurrentCards(seenTitles) {
  // This function is serialized and run in browser context.
  // seenTitles: Set passed as array (page.evaluate can't serialize Set)
  const seen = new Set(seenTitles);
  const newCards = [];

  function decodeProxyUrl(src) {
    const m = src.match(/\/cdn-cgi\/image\/[^/]+\/(.+)/);
    if (!m) return src;
    try { return decodeURIComponent(m[1]); } catch { return src; }
  }

  const h3s = [...document.querySelectorAll('h3')];

  for (const h3 of h3s) {
    const title = h3.innerText?.trim() || '';
    if (!title || title.length < 2 || seen.has(title)) continue;

    // Walk up to find card container (has img + x.com link)
    let card = h3;
    let found = false;
    for (let i = 0; i < 15; i++) {
      if (!card.parentElement) break;
      card = card.parentElement;
      const hasImg = !!card.querySelector('img[src*="cdn-cgi"], img[src*="cms-assets"]');
      const hasX   = !!card.querySelector('a[href*="x.com"], a[href*="twitter.com"]');
      if (hasImg && hasX) { found = true; break; }
    }
    if (!found) continue;

    // Images
    const imgEls = [...card.querySelectorAll('img[src*="cdn-cgi"], img[src*="cms-assets"]')];
    const imgs = imgEls
      .map(img => decodeProxyUrl(img.getAttribute('src') || ''))
      .filter(s => s.includes('cms-assets.youmind.com') || s.includes('cdn.gooo.ai'));
    if (imgs.length === 0) continue;

    // Links
    const xLinks = [...card.querySelectorAll('a[href*="x.com"], a[href*="twitter.com"]')];
    const tweetLink  = xLinks.find(a => a.href.includes('/status/'));
    const authorLink = xLinks.find(a => !a.href.includes('/status/'));
    const sourceUrl  = (tweetLink?.href || '').split('#')[0];

    // Prompt text — look for the longest substantive text block
    let prompt = '';
    const codeEl = card.querySelector('pre, code, textarea');
    if (codeEl) {
      prompt = codeEl.innerText?.trim() || '';
    }
    if (!prompt) {
      const texts = [...card.querySelectorAll('p, div')]
        .map(el => el.childNodes.length === 1 && el.firstChild?.nodeType === 3
          ? el.innerText?.trim()
          : '')
        .filter(t => t && t.length > 60);
      texts.sort((a, b) => b.length - a.length);
      prompt = texts[0] || '';
    }
    if (!prompt) {
      // Fallback: longest text inside the card
      const allText = [...card.querySelectorAll('p, div, span')]
        .map(el => el.innerText?.trim() || '')
        .filter(t => t.length > 60);
      allText.sort((a, b) => b.length - a.length);
      prompt = allText[0] || '';
    }

    const featured = card.innerText.includes('精选');

    newCards.push({
      title,
      thumbnail: imgs[0],
      outputImages: [...new Set(imgs)],
      author:    (authorLink?.innerText?.trim() || '').replace(/^@/, ''),
      authorUrl: authorLink?.href || '',
      sourceUrl,
      prompt,
      featured,
    });

    seen.add(title);
  }

  return newCards;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(IMAGES_DIR, { recursive: true });

  let existing = [];
  try {
    existing = JSON.parse(await readFile(OUTPUT, 'utf-8'));
    console.log(`Existing entries: ${existing.length}`);
  } catch { console.log('No existing data found.'); }

  const existingIds = new Set(existing.map(e => e.id));

  console.log('Launching Chromium…');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  // Capture console output from page for debugging
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('[PAGE]', msg.text());
  });

  console.log(`Navigating to ${TARGET_URL}…`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  const allScraped = [];
  const seenTitles = [];

  let prevCount = 0;
  let stableRounds = 0;
  let rateLimited = false;
  const maxRounds = 150;

  // Detect rate-limit errors from the page
  page.on('console', msg => {
    if (msg.text().includes('429') || msg.text().includes('Failed to load more prompts')) {
      rateLimited = true;
    }
  });

  for (let round = 0; round < maxRounds; round++) {
    // Extract any new cards visible right now
    const newCards = await page.evaluate(extractCurrentCards, seenTitles);
    for (const c of newCards) {
      allScraped.push(c);
      seenTitles.push(c.title);
    }

    const total = allScraped.length;
    process.stdout.write(`\r  Collected ${total} (round ${round + 1}, new=${newCards.length})   `);

    if (total >= TARGET) {
      console.log(`\n  Reached target (${total})!`);
      break;
    }

    // If rate-limited, wait longer for the API to recover
    if (rateLimited) {
      process.stdout.write(`\r  Rate limited — waiting 15s before retrying…               `);
      await page.waitForTimeout(15000);
      rateLimited = false;
    }

    // Scroll down to trigger more content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3500);

    // Check if new content loaded
    const h3Count = await page.evaluate(() => document.querySelectorAll('h3').length);
    if (h3Count === prevCount && newCards.length === 0) {
      stableRounds++;
      if (stableRounds >= 5) {
        console.log(`\n  No new content after 5 stable rounds — done.`);
        break;
      }
    } else {
      stableRounds = 0;
    }
    prevCount = h3Count;
  }

  // One final extraction pass to catch any remaining cards
  const finalBatch = await page.evaluate(extractCurrentCards, seenTitles);
  for (const c of finalBatch) {
    allScraped.push(c);
    seenTitles.push(c.title);
  }

  await browser.close();
  console.log(`\nTotal scraped: ${allScraped.length} cards`);

  if (allScraped.length < 10) {
    console.error('\n⚠  Too few results — the site structure may have changed.');
    process.exit(1);
  }

  // Convert to PromptEntry format, dedup against existing
  const newEntries = allScraped
    .map(s => {
      const tweetM = (s.sourceUrl || '').match(/status\/(\d+)/);
      if (!tweetM) return null;
      const id = tweetM[1];
      if (existingIds.has(id)) return null;

      const lang = detectLang(s.prompt + s.title);
      const cat  = detectCategory(s.title + ' ' + s.prompt);

      return {
        id,
        title:           truncate(s.title),
        thumbnail:       s.thumbnail,
        thumbnailAspect: 1.33,
        author:          s.author,
        authorUrl:       s.authorUrl,
        tags:            [...new Set([lang, cat, ...(s.featured ? ['featured'] : [])])],
        category:        cat,
        lang,
        stats:           { likes: s.featured ? 500 : 0, retweets: 0, views: 0 },
        createdAt:       '',
        prompt:          s.prompt,
        outputImages:    s.outputImages,
        sourceUrl:       s.sourceUrl || s.authorUrl,
        _dl:             s.outputImages.map((url, i) => ({ url, i })),
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
    await runConcurrent(tasks, 10);
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
