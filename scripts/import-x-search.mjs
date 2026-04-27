/**
 * Imports image-prompt candidates from the official X API search endpoints.
 *
 * Dry run:
 *   X_BEARER_TOKEN=... npm run import:x -- --from-url "https://x.com/search?q=chatgpt%20image%20prompt&src=typed_query"
 *
 * Write into the gallery:
 *   X_BEARER_TOKEN=... npm run import:x -- --from-url "https://x.com/search?q=chatgpt%20image%20prompt&src=typed_query" --write
 */

import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanupEntries, formatPromptCleanupSummary } from './prompt-cleanup.mjs';
import { detectCategory, extractTags, truncate } from './gallery-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'data', 'prompts.json');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const CANDIDATES_OUTPUT = path.join(ROOT, 'tmp', 'x-candidates.json');

const API_ENDPOINTS = {
  recent: 'https://api.x.com/2/tweets/search/recent',
  all: 'https://api.x.com/2/tweets/search/all',
};

const DEFAULT_QUERY = 'chatgpt image prompt has:images -is:retweet';

function showHelp() {
  console.log(`
Import X image-prompt candidates into the prompt gallery.

Usage:
  X_BEARER_TOKEN=... npm run import:x -- [options]

Options:
  --from-url <url>       Read the q= query from an X search URL
  --query <query>        X API search query
  --endpoint <recent|all>
                         recent searches the last 7 days; all requires eligible X API access
  --limit <n>            Max posts to request before filtering (default: 100)
  --min-likes <n>        Minimum likes required (default: 25)
  --min-retweets <n>     Minimum reposts required (default: 0)
  --min-views <n>        Minimum impressions/views required when available (default: 0)
  --min-score <n>        Minimum quality score from text + engagement heuristic (default: 0)
  --lang <codes>         Comma-separated language filter, for example en,zh,ja
  --out <path>           Candidate JSON path for dry runs (default: tmp/x-candidates.json)
  --write                Merge new entries into src/data/prompts.json
  --no-download          In --write mode, keep remote image URLs instead of downloading
  --no-default-filters   Do not append has:images and -is:retweet to the query
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    query: process.env.X_SEARCH_QUERY || DEFAULT_QUERY,
    endpoint: process.env.X_SEARCH_ENDPOINT || 'recent',
    limit: Number(process.env.X_IMPORT_LIMIT || 100),
    minLikes: Number(process.env.X_MIN_LIKES || 25),
    minRetweets: Number(process.env.X_MIN_RETWEETS || 0),
    minViews: Number(process.env.X_MIN_VIEWS || 0),
    minScore: Number(process.env.X_MIN_SCORE || 0),
    langs: (process.env.X_LANGS || '').split(',').map((s) => s.trim()).filter(Boolean),
    out: process.env.X_CANDIDATES_OUTPUT || CANDIDATES_OUTPUT,
    write: false,
    download: true,
    defaultFilters: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--from-url') opts.query = queryFromXSearchUrl(next());
    else if (arg.startsWith('--from-url=')) opts.query = queryFromXSearchUrl(arg.slice(11));
    else if (arg === '--query') opts.query = next();
    else if (arg.startsWith('--query=')) opts.query = arg.slice(8);
    else if (arg === '--endpoint') opts.endpoint = next();
    else if (arg.startsWith('--endpoint=')) opts.endpoint = arg.slice(11);
    else if (arg === '--limit') opts.limit = Number(next());
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice(8));
    else if (arg === '--min-likes') opts.minLikes = Number(next());
    else if (arg.startsWith('--min-likes=')) opts.minLikes = Number(arg.slice(12));
    else if (arg === '--min-retweets') opts.minRetweets = Number(next());
    else if (arg.startsWith('--min-retweets=')) opts.minRetweets = Number(arg.slice(15));
    else if (arg === '--min-views') opts.minViews = Number(next());
    else if (arg.startsWith('--min-views=')) opts.minViews = Number(arg.slice(12));
    else if (arg === '--min-score') opts.minScore = Number(next());
    else if (arg.startsWith('--min-score=')) opts.minScore = Number(arg.slice(12));
    else if (arg === '--lang') opts.langs = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--lang=')) opts.langs = arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--out') opts.out = path.resolve(ROOT, next());
    else if (arg.startsWith('--out=')) opts.out = path.resolve(ROOT, arg.slice(6));
    else if (arg === '--write') opts.write = true;
    else if (arg === '--no-download') opts.download = false;
    else if (arg === '--no-default-filters') opts.defaultFilters = false;
    else if (!arg.startsWith('-') && arg.startsWith('http')) opts.query = queryFromXSearchUrl(arg);
    else if (!arg.startsWith('-')) opts.query = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }

  opts.endpoint = opts.endpoint.toLowerCase();
  if (!API_ENDPOINTS[opts.endpoint]) {
    throw new Error(`Unsupported endpoint "${opts.endpoint}". Use "recent" or "all".`);
  }

  for (const [key, value] of Object.entries({
    limit: opts.limit,
    minLikes: opts.minLikes,
    minRetweets: opts.minRetweets,
    minViews: opts.minViews,
    minScore: opts.minScore,
  })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key}: ${value}`);
  }

  if (opts.defaultFilters) opts.query = addDefaultSearchFilters(opts.query);
  return opts;
}

function queryFromXSearchUrl(rawUrl) {
  const url = new URL(rawUrl);
  const query = url.searchParams.get('q');
  if (!query) throw new Error('X search URL does not include a q= query parameter.');
  return query;
}

function addDefaultSearchFilters(query) {
  const extras = [];
  if (!/\bhas:(images|media)\b/i.test(query)) extras.push('has:images');
  if (!/(^|\s)-?is:retweet\b/i.test(query)) extras.push('-is:retweet');
  return [query, ...extras].join(' ').trim();
}

function cleanTweetText(text = '') {
  return text
    .replace(/https:\/\/t\.co\/\w+/g, '')
    .replace(/pic\.x\.com\/\w+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPrompt(text = '') {
  const cleaned = cleanTweetText(text);
  const marker = cleaned.match(/(?:prompt|prompts|提示词|提示|プロンプト)\s*[:：]\s*([\s\S]+)/i);
  return (marker?.[1] || cleaned).trim();
}

function detectLang(tweetLang, text = '') {
  const normalized = tweetLang?.toLowerCase();
  if (normalized?.startsWith('zh')) return 'zh';
  if (normalized?.startsWith('ja')) return 'ja';
  if (normalized === 'en') return 'en';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';
  return normalized && normalized !== 'und' ? 'other' : 'en';
}

function titleFromText(text, fallback) {
  const firstUsefulLine = cleanTweetText(text)
    .split('\n')
    .map((line) => line.replace(/^["'`{[\s]+/, '').replace(/["'`}\]\s]+$/, '').trim())
    .find((line) => line.length > 0);
  return truncate(firstUsefulLine || fallback, 90);
}

function refreshEntryClassification(entry) {
  const classificationText = `${entry.prompt || entry.title || ''}`.trim();
  entry.lang = detectLang(undefined, classificationText);
  entry.category = detectCategory(classificationText);
  entry.tags = extractTags(classificationText, entry.lang, entry.category);
  delete entry.aiReview;
}

function scoreTweet(tweet, photos) {
  const metrics = tweet.public_metrics || {};
  const text = cleanTweetText(tweet.text);
  let score = 0;
  score += Math.min(metrics.like_count || 0, 5000) * 2;
  score += Math.min(metrics.retweet_count || 0, 1000) * 4;
  score += Math.log10((metrics.impression_count || 0) + 1) * 12;
  score += photos.length * 8;

  if (/(prompt|prompts|提示词|提示|プロンプト)/i.test(text)) score += 35;
  if (/(chatgpt|gpt-4o|gpt image|image generation|生成|画像)/i.test(text)) score += 20;
  if (text.length >= 80) score += 15;
  if (/```|{[\s\S]*}|"style"|"subject"|拍摄|style:/i.test(text)) score += 10;
  if (tweet.possibly_sensitive) score -= 50;
  return Math.round(score);
}

function xPostUrl(tweet, user) {
  return user?.username
    ? `https://x.com/${user.username}/status/${tweet.id}`
    : `https://x.com/i/web/status/${tweet.id}`;
}

function imageAspect(media) {
  if (!media?.width || !media?.height) return 1.33;
  return Number((media.height / media.width).toFixed(3));
}

async function searchX(token, opts) {
  const tweets = [];
  const includes = { media: [], users: [] };
  let nextToken = '';

  while (tweets.length < opts.limit) {
    const pageSize = Math.min(100, Math.max(10, opts.limit - tweets.length));
    const params = new URLSearchParams({
      query: opts.query,
      max_results: String(pageSize),
      expansions: 'author_id,attachments.media_keys',
      'tweet.fields': 'attachments,author_id,created_at,lang,possibly_sensitive,public_metrics',
      'media.fields': 'alt_text,height,media_key,preview_image_url,type,url,width',
      'user.fields': 'name,username',
    });
    if (nextToken) params.set('next_token', nextToken);

    const url = `${API_ENDPOINTS[opts.endpoint]}?${params.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.text();

    if (!res.ok) {
      throw new Error(`X API ${res.status}: ${body.slice(0, 600)}`);
    }

    const json = body ? JSON.parse(body) : {};
    tweets.push(...(json.data || []));
    includes.media.push(...(json.includes?.media || []));
    includes.users.push(...(json.includes?.users || []));

    nextToken = json.meta?.next_token || '';
    if (!nextToken || !json.data?.length) break;
  }

  return { tweets, includes };
}

function toPromptEntries({ tweets, includes }, opts) {
  const mediaByKey = new Map(includes.media.map((media) => [media.media_key, media]));
  const userById = new Map(includes.users.map((user) => [user.id, user]));

  return tweets
    .map((tweet) => {
      const photos = (tweet.attachments?.media_keys || [])
        .map((key) => mediaByKey.get(key))
        .filter((media) => media?.type === 'photo' && media.url);
      if (!photos.length) return null;

      const user = userById.get(tweet.author_id);
      const cleanedText = cleanTweetText(tweet.text);
      const prompt = extractPrompt(tweet.text);
      const category = detectCategory(`${cleanedText}\n${prompt}`);
      const lang = detectLang(tweet.lang, cleanedText);
      const metrics = tweet.public_metrics || {};
      const score = scoreTweet(tweet, photos);
      const sourceUrl = xPostUrl(tweet, user);

      return {
        id: tweet.id,
        title: titleFromText(cleanedText, `X Post ${tweet.id}`),
        thumbnail: photos[0].url,
        thumbnailAspect: imageAspect(photos[0]),
        author: user?.username || user?.name || tweet.author_id || 'unknown',
        authorUrl: user?.username ? `https://x.com/${user.username}` : sourceUrl,
        tags: extractTags(cleanedText, lang, category),
        category,
        lang,
        stats: {
          likes: metrics.like_count || 0,
          retweets: metrics.retweet_count || 0,
          views: metrics.impression_count || 0,
        },
        createdAt: tweet.created_at || new Date().toISOString(),
        prompt,
        outputImages: photos.map((photo) => photo.url),
        sourceUrl,
        _score: score,
        _dl: photos.map((photo, i) => ({ url: photo.url, i })),
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.stats.likes >= opts.minLikes)
    .filter((entry) => entry.stats.retweets >= opts.minRetweets)
    .filter((entry) => entry.stats.views >= opts.minViews)
    .filter((entry) => entry._score >= opts.minScore)
    .filter((entry) => opts.langs.length === 0 || opts.langs.includes(entry.lang))
    .sort((a, b) => b._score - a._score || b.stats.likes - a.stats.likes);
}

async function downloadImage(url, dest) {
  try {
    await access(dest);
    return true;
  } catch {}

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromptGallery/1.0)' },
    });
    if (!res.ok || !res.body) return false;
    await pipeline(res.body, createWriteStream(dest));
    return true;
  } catch {
    return false;
  }
}

async function runConcurrent(fns, concurrency = 8) {
  let idx = 0;
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (idx < fns.length) {
      const fn = fns[idx++];
      if (await fn()) ok++;
      else fail++;
      if ((ok + fail) % 25 === 0) {
        process.stdout.write(`\r  Images ${ok + fail}/${fns.length} (${fail} failed)   `);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  if (fns.length) process.stdout.write('\n');
  return { ok, fail };
}

async function readExistingEntries() {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf-8'));
  } catch {
    return [];
  }
}

async function writeCandidates(entries, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const clean = entries.map(({ _dl, ...entry }) => entry);
  await writeFile(outputPath, JSON.stringify(clean, null, 2), 'utf-8');
}

async function writeGalleryEntries(entries, opts) {
  await mkdir(IMAGES_DIR, { recursive: true });

  const existing = await readExistingEntries();
  const existingIds = new Set(existing.map((entry) => entry.id));
  const newEntries = entries.filter((entry) => !existingIds.has(entry.id));

  if (opts.download) {
    const tasks = newEntries.flatMap((entry) =>
      entry._dl.map(({ url, i }) => async () => {
        const dest = path.join(IMAGES_DIR, `${entry.id}_${i}.jpg`);
        const webPath = `/images/${entry.id}_${i}.jpg`;
        const ok = await downloadImage(url, dest);
        if (ok) {
          entry.outputImages[i] = webPath;
          if (i === 0) entry.thumbnail = webPath;
        }
        return ok;
      })
    );

    console.log(`Downloading ${tasks.length} images...`);
    const { ok, fail } = await runConcurrent(tasks);
    console.log(`Images: ${ok} downloaded, ${fail} failed`);
  }

  for (const entry of newEntries) entry.pending = true;

  const merged = [...existing, ...newEntries]
    .map(({ _dl, _score, ...entry }) => entry)
    .sort((a, b) => b.stats.likes - a.stats.likes);

  await writeFile(OUTPUT, JSON.stringify(merged, null, 2), 'utf-8');
  return { added: newEntries.length, total: merged.length, duplicates: entries.length - newEntries.length };
}

function printSummary(entries, opts) {
  console.log(`Query: ${opts.query}`);
  console.log(`Endpoint: ${opts.endpoint}`);
  console.log(`Candidates after filters: ${entries.length}`);

  if (!entries.length) return;

  console.log('\nTop candidates:');
  for (const entry of entries.slice(0, 10)) {
    console.log(`- score ${entry._score} | ${entry.stats.likes} likes | ${entry.sourceUrl}`);
    console.log(`  ${entry.title}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    showHelp();
    return;
  }

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    showHelp();
    throw new Error('Missing X_BEARER_TOKEN. Create an X developer app and export its bearer token first.');
  }

  console.log('Searching X API...');
  const raw = await searchX(token, opts);
  console.log(`Fetched ${raw.tweets.length} posts from X.`);

  const entries = toPromptEntries(raw, opts);
  await cleanupEntries(entries, {
    root: ROOT,
    onProgress(entry, result, index, total) {
      refreshEntryClassification(entry);
      console.log(`Prompt cleanup ${index}/${total} ${entry.id}: ${formatPromptCleanupSummary(result)}`);
    },
  });
  printSummary(entries, opts);

  if (opts.write) {
    const result = await writeGalleryEntries(entries, opts);
    console.log(`\nDone. Added ${result.added} new entries, skipped ${result.duplicates} duplicates, total ${result.total}.`);
  } else {
    await writeCandidates(entries, opts.out);
    console.log(`\nDry run only. Wrote candidates to ${path.relative(ROOT, opts.out)}.`);
    console.log('Review them, then rerun with --write to merge into the gallery.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
