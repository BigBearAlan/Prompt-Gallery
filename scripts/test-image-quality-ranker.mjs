#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'prompts.json');
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma4:e4b';
const DEFAULT_LIMIT = 100;
const DEFAULT_SEED = 1;
const DEFAULT_TIMEOUT_MS = 90_000;
const VERSION = 1;
const DEFAULT_RANKING_DATA_PATH = path.join(ROOT, 'src', 'data', 'image-quality.json');
const SCORE_SPREAD = {
  strategy: 'conservative-piecewise-v2',
  min: 1,
  max: 99,
};

const CATEGORY_ORDER = [
  'advertising',
  'game',
  'illustration',
  'infographic',
  'logo',
  'manga',
  'other',
  'photography',
  'portrait',
  'poster',
  'ui',
];

function usage() {
  console.log(`
Image quality ranker.

Scores a deterministic, category-stratified sample of local gallery images with
Ollama, or scores every local gallery image with --all. Detailed review reports
stay under tmp/. Use --write-ranking-data when you want the app to consume the
compact score output.

Usage:
  node scripts/test-image-quality-ranker.mjs [options]

Options:
  --limit <n>            Number of images to score (default: ${DEFAULT_LIMIT})
  --all                  Score every local image referenced by src/data/prompts.json
  --seed <n>             Deterministic sampling seed (default: ${DEFAULT_SEED})
  --model <name>         Ollama model (default: ${DEFAULT_MODEL})
  --ollama-host <url>    Ollama host (default: ${DEFAULT_OLLAMA_HOST})
  --timeout-ms <n>       Per-image timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --out-prefix <path>    Output prefix; writes .json, .md, and .html
  --from-json <path>     Recalibrate and regenerate reports from an existing result JSON
  --resume               Reuse existing results from the output JSON when present
  --write-ranking-data   Write compact app ranking data to src/data/image-quality.json
  --ranking-data-path    Override the compact ranking data output path
  --help                 Show this help

Examples:
  node scripts/test-image-quality-ranker.mjs --limit 100 --model gemma4:e4b
  node scripts/test-image-quality-ranker.mjs --limit 20 --seed 2
  node scripts/test-image-quality-ranker.mjs --all --model gemma4:e4b --resume --write-ranking-data
  node scripts/test-image-quality-ranker.mjs --from-json tmp/image-quality-test-100.json
`);
}

function parsePositiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Math.floor(parsed);
}

function parseArgs(argv) {
  const opts = {
    limit: DEFAULT_LIMIT,
    seed: DEFAULT_SEED,
    model: DEFAULT_MODEL,
    ollamaHost: DEFAULT_OLLAMA_HOST,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outPrefix: '',
    fromJson: '',
    all: false,
    resume: false,
    writeRankingData: false,
    rankingDataPath: DEFAULT_RANKING_DATA_PATH,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '--resume') opts.resume = true;
    else if (arg === '--write-ranking-data') opts.writeRankingData = true;
    else if (arg === '--limit') opts.limit = parsePositiveInt(next(), 'limit');
    else if (arg.startsWith('--limit=')) opts.limit = parsePositiveInt(arg.slice(8), 'limit');
    else if (arg === '--seed') opts.seed = parsePositiveInt(next(), 'seed');
    else if (arg.startsWith('--seed=')) opts.seed = parsePositiveInt(arg.slice(7), 'seed');
    else if (arg === '--model') opts.model = next();
    else if (arg.startsWith('--model=')) opts.model = arg.slice(8);
    else if (arg === '--ollama-host') opts.ollamaHost = next();
    else if (arg.startsWith('--ollama-host=')) opts.ollamaHost = arg.slice(14);
    else if (arg === '--timeout-ms') opts.timeoutMs = parsePositiveInt(next(), 'timeout-ms');
    else if (arg.startsWith('--timeout-ms=')) opts.timeoutMs = parsePositiveInt(arg.slice(13), 'timeout-ms');
    else if (arg === '--out-prefix') opts.outPrefix = path.resolve(ROOT, next());
    else if (arg.startsWith('--out-prefix=')) opts.outPrefix = path.resolve(ROOT, arg.slice(13));
    else if (arg === '--from-json') opts.fromJson = path.resolve(ROOT, next());
    else if (arg.startsWith('--from-json=')) opts.fromJson = path.resolve(ROOT, arg.slice(12));
    else if (arg === '--ranking-data-path') opts.rankingDataPath = path.resolve(ROOT, next());
    else if (arg.startsWith('--ranking-data-path=')) opts.rankingDataPath = path.resolve(ROOT, arg.slice(20));
    else throw new Error(`Unknown option: ${arg}`);
  }

  opts.ollamaHost = opts.ollamaHost.replace(/\/$/, '');
  if (!opts.outPrefix && opts.fromJson) {
    const dirname = path.dirname(opts.fromJson);
    const basename = path.basename(opts.fromJson).replace(/\.json$/i, '');
    opts.outPrefix = path.join(dirname, basename);
  } else if (!opts.outPrefix) {
    const modelSlug = opts.model.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const calibrationSlug = SCORE_SPREAD.strategy.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const suffix = opts.seed === DEFAULT_SEED ? '' : `-seed${opts.seed}`;
    opts.outPrefix = opts.all
      ? path.join(ROOT, 'tmp', `image-quality-all-${modelSlug}-${calibrationSlug}`)
      : path.join(ROOT, 'tmp', `image-quality-test-${opts.limit}-${modelSlug}-${calibrationSlug}${suffix}`);
  }

  return opts;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value = '', max = 96) {
  const normalized = normalizeText(value);
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function localImagePath(image) {
  if (!image || /^https?:\/\//i.test(image)) return '';
  if (image.startsWith('/')) return path.join(ROOT, 'public', image.slice(1));
  return path.resolve(ROOT, image);
}

async function loadEntries() {
  const entries = JSON.parse(await readFile(DATA_PATH, 'utf-8'));
  if (!Array.isArray(entries)) throw new Error(`${DATA_PATH} must contain an array.`);
  return entries.filter((entry) => !entry.pending);
}

function collectLocalImageCandidates(entries) {
  const byCategory = new Map();
  const seen = new Set();

  for (const entry of entries) {
    const category = entry.category || 'other';
    const images = [entry.thumbnail, ...(entry.outputImages || [])].filter(Boolean);

    for (const image of images) {
      if (!String(image).startsWith('/images/')) continue;
      const filePath = localImagePath(image);
      if (!filePath || !existsSync(filePath)) continue;

      const key = `${entry.id}::${image}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push({
        image,
        filePath,
        entryId: entry.id,
        category,
        title: entry.title || '',
      });
    }
  }

  return byCategory;
}

function categoryNames(byCategory) {
  const found = [...byCategory.keys()].filter((category) => byCategory.get(category)?.length);
  return [
    ...CATEGORY_ORDER.filter((category) => found.includes(category)),
    ...found.filter((category) => !CATEGORY_ORDER.includes(category)).sort(),
  ];
}

function chooseSample(byCategory, limit, seed) {
  const categories = categoryNames(byCategory);
  const sortedByCategory = new Map();

  for (const category of categories) {
    const rows = [...byCategory.get(category)]
      .sort((a, b) => {
        const ah = stableHash(`${seed}:${category}:${a.entryId}:${a.image}`);
        const bh = stableHash(`${seed}:${category}:${b.entryId}:${b.image}`);
        return ah - bh || a.image.localeCompare(b.image);
      });
    sortedByCategory.set(category, rows);
  }

  const selected = [];
  const selectedImages = new Set();
  const cursors = Object.fromEntries(categories.map((category) => [category, 0]));

  while (selected.length < limit) {
    let addedInRound = false;

    for (const category of categories) {
      const rows = sortedByCategory.get(category) || [];
      while (cursors[category] < rows.length && selectedImages.has(rows[cursors[category]].image)) {
        cursors[category]++;
      }
      if (cursors[category] >= rows.length) continue;

      const row = rows[cursors[category]++];
      selected.push(row);
      selectedImages.add(row.image);
      addedInRound = true;
      if (selected.length >= limit) break;
    }

    if (!addedInRound) break;
  }

  return selected;
}

function chooseAll(byCategory) {
  return categoryNames(byCategory)
    .flatMap((category) => [...(byCategory.get(category) || [])])
    .sort((a, b) =>
      a.category.localeCompare(b.category) ||
      a.entryId.localeCompare(b.entryId) ||
      a.image.localeCompare(b.image)
    );
}

function extractJson(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model did not return JSON.');
  }
  return JSON.parse(trimmed.slice(first, last + 1));
}

function tierFromScore(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  if (score >= 30) return 'weak';
  return 'bad';
}

function calibrateScore(rawScore) {
  if (!Number.isFinite(rawScore)) return 0;
  let score;

  if (rawScore <= 20) {
    score = rawScore * 0.9;
  } else if (rawScore <= 40) {
    score = 18 + (rawScore - 20) * 1.1;
  } else if (rawScore <= 60) {
    score = 40 + (rawScore - 40);
  } else if (rawScore <= 75) {
    score = 60 + (rawScore - 60) * 0.8;
  } else if (rawScore <= 88) {
    score = 72 + (rawScore - 75) * 0.55;
  } else if (rawScore <= 95) {
    score = 79 + (rawScore - 88) * 1.4;
  } else {
    score = 89 + (rawScore - 95) * 2;
  }

  return Math.max(SCORE_SPREAD.min, Math.min(SCORE_SPREAD.max, Math.round(score)));
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 4);
  if (typeof value === 'string' && value.trim()) return [normalizeText(value)].slice(0, 1);
  return [];
}

function normalizeScoreResult(raw, row) {
  const parsedScore = Number(raw.score);
  const rawScore = Math.max(0, Math.min(100, Number.isFinite(parsedScore) ? Math.round(parsedScore) : 0));
  const score = calibrateScore(rawScore);
  const tier = tierFromScore(score);

  return {
    status: 'ok',
    image: row.image,
    entryId: row.entryId,
    category: row.category,
    title: row.title,
    score,
    rawScore,
    tier,
    reason: truncate(raw.reason || '', 280),
    visualStrengths: normalizeStringArray(raw.visualStrengths),
    visualProblems: normalizeStringArray(raw.visualProblems),
  };
}

function recalibrateExistingResult(result) {
  if (!result || result.status !== 'ok') return result;
  const parsedRawScore = Number(result.rawScore ?? result.score);
  const rawScore = Math.max(0, Math.min(100, Number.isFinite(parsedRawScore) ? Math.round(parsedRawScore) : 0));
  const score = calibrateScore(rawScore);
  return {
    ...result,
    rawScore,
    score,
    tier: tierFromScore(score),
  };
}

function buildPrompt(row) {
  return [
    'You are a strict visual-quality judge for an AI image prompt gallery.',
    'Score ONLY pure visual aesthetics. Ignore social popularity, likes, views, whether the idea is useful, and whether the category is commercially valuable.',
    'Be harsh and comparative. This is a large mixed gallery: ordinary nice AI images should NOT receive excellent scores.',
    'Use the full 0-100 range and choose a precise integer. Do not reuse safe numbers like 78, 88, or 93 unless truly justified.',
    'A typical competent AI gallery image should be around 55-68. A good polished image should be around 70-79. Excellent should be rare.',
    'Give low scores to ugly, broken, blurry, cluttered, generic, incoherent, badly composed, or anatomy/text-damaged images.',
    'Give 90+ only to images that look exceptional compared with professional commercial/editorial visual work.',
    '',
    'Score from 0 to 100:',
    '- 90-100: rare, exceptional, professional-grade visual craft; top 2-5% only.',
    '- 80-89: very strong and polished with memorable visual impact.',
    '- 70-79: good, clearly above average, but not elite.',
    '- 55-69: decent or competent but ordinary, generic, or flawed.',
    '- 35-59: weak image with noticeable quality, composition, anatomy, text, or coherence issues.',
    '- 0-34: bad or unusable image, severe artifacts, blur, incoherence, or very poor aesthetics.',
    '',
    'Reward: composition, lighting, color harmony, clarity, polish, visual impact, appealing style.',
    'Penalize: blur, artifacts, bad anatomy, ugly rendering, clutter, weak framing, incoherent generated output, unreadable or broken text when text is central.',
    '',
    'Return strict JSON only. No markdown. No prose outside JSON.',
    'Use this exact shape:',
    '{"score":0,"tier":"average","reason":"","visualStrengths":[""],"visualProblems":[""]}',
    '',
    `Existing gallery category: ${row.category}`,
    `Existing card title: ${row.title || '(untitled)'}`,
  ].join('\n');
}

async function scoreImage(row, opts) {
  try {
    const imageBase64 = (await readFile(row.filePath)).toString('base64');
    const res = await fetch(`${opts.ollamaHost}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        stream: false,
        think: false,
        format: 'json',
        messages: [
          {
            role: 'user',
            content: buildPrompt(row),
            images: [imageBase64],
          },
        ],
        options: {
          temperature: 0,
          num_predict: 500,
        },
      }),
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
    const json = body ? JSON.parse(body) : {};
    const content = json.message?.content || json.response || '';
    return normalizeScoreResult(extractJson(content), row);
  } catch (error) {
    return {
      status: 'error',
      image: row.image,
      entryId: row.entryId,
      category: row.category,
      title: row.title,
      score: null,
      tier: 'error',
      reason: String(error.message || error).slice(0, 500),
      visualStrengths: [],
      visualProblems: [],
    };
  }
}

function summarize(results) {
  const ok = results.filter((result) => result.status === 'ok');
  const failures = results.length - ok.length;
  const averageScore = ok.length
    ? Math.round((ok.reduce((sum, result) => sum + result.score, 0) / ok.length) * 10) / 10
    : null;
  const tierCounts = {};
  for (const result of ok) tierCounts[result.tier] = (tierCounts[result.tier] || 0) + 1;

  const ranked = [...ok].sort((a, b) => b.score - a.score || a.image.localeCompare(b.image));
  return {
    total: results.length,
    scored: ok.length,
    failures,
    averageScore,
    tierCounts,
    top10: ranked.slice(0, 10),
    bottom10: ranked.slice(-10).reverse(),
  };
}

function markdownEscape(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function markdownList(items) {
  return items.length ? items.map(markdownEscape).join('<br>') : '';
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlList(items) {
  if (!items.length) return '<span class="muted">None</span>';
  return `<ul>${items.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul>`;
}

function imageFileHref(image) {
  const filePath = localImagePath(image);
  return filePath ? pathToFileURL(filePath).href : image;
}

function buildMarkdownReport(payload) {
  const { summary, results } = payload;
  const ranked = [...results].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
    return (b.score ?? -1) - (a.score ?? -1) || a.image.localeCompare(b.image);
  });
  const lines = [];

  lines.push(`# Image Quality ${payload.all ? 'All Images' : `Test ${payload.limit}`}`);
  lines.push('');
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`Model: \`${payload.model}\``);
  lines.push(`Limit: ${payload.limit}`);
  lines.push(`Seed: ${payload.seed}`);
  lines.push(`Calibration: ${payload.scoreSpread?.strategy ?? SCORE_SPREAD.strategy}`);
  lines.push(`Average score: ${summary.averageScore ?? 'n/a'}`);
  lines.push(`Scored: ${summary.scored}/${summary.total}`);
  lines.push(`Failures: ${summary.failures}`);
  lines.push('');
  lines.push('## Tier Counts');
  lines.push('');
  for (const tier of ['excellent', 'good', 'average', 'weak', 'bad']) {
    lines.push(`- ${tier}: ${summary.tierCounts[tier] || 0}`);
  }
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Rank | Preview | Score | Raw | Tier | Category | Entry | Reason | Strengths | Problems |');
  lines.push('| ---: | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |');

  ranked.forEach((result, index) => {
    const previewPath = result.image.startsWith('/images/')
      ? `../public${result.image}`
      : result.image;
    const preview = `<img src="${previewPath}" width="120">`;
    const score = result.status === 'ok' ? result.score : 'ERR';
    const rawScore = result.status === 'ok' ? (result.rawScore ?? result.score) : 'ERR';
    const entry = `${markdownEscape(result.entryId)}<br>${markdownEscape(truncate(result.title, 64))}`;
    lines.push(
      `| ${index + 1} | ${preview} | ${score} | ${rawScore} | ${markdownEscape(result.tier)} | ` +
      `${markdownEscape(result.category)} | ${entry} | ${markdownEscape(result.reason)} | ` +
      `${markdownList(result.visualStrengths)} | ${markdownList(result.visualProblems)} |`
    );
  });

  return `${lines.join('\n')}\n`;
}

function buildHtmlReport(payload) {
  const { summary, results } = payload;
  const ranked = [...results].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
    return (b.score ?? -1) - (a.score ?? -1) || a.image.localeCompare(b.image);
  });

  const tierCounts = ['excellent', 'good', 'average', 'weak', 'bad']
    .map((tier) => `<span class="pill ${tier}">${tier}: ${summary.tierCounts[tier] || 0}</span>`)
    .join('');

  const cards = ranked.map((result, index) => {
    const href = imageFileHref(result.image);
    const score = result.status === 'ok' ? result.score : 'ERR';
    const rawScore = result.status === 'ok' ? (result.rawScore ?? result.score) : 'ERR';
    return `
      <article class="card ${htmlEscape(result.tier)}">
        <a class="image-link" href="${htmlEscape(href)}" target="_blank" rel="noreferrer">
          <img src="${htmlEscape(href)}" alt="${htmlEscape(result.title || result.image)}" loading="lazy">
        </a>
        <div class="body">
          <div class="topline">
            <span class="rank">#${index + 1}</span>
            <span class="score">${htmlEscape(score)}</span>
            <span class="tier">${htmlEscape(result.tier)}</span>
          </div>
          <div class="raw">Raw model score ${htmlEscape(rawScore)}</div>
          <div class="meta">${htmlEscape(result.category)} / ${htmlEscape(result.entryId)}</div>
          <h2>${htmlEscape(truncate(result.title, 96) || result.image)}</h2>
          <p>${htmlEscape(result.reason || 'No reason returned.')}</p>
          <div class="notes">
            <section>
              <h3>Strengths</h3>
              ${htmlList(result.visualStrengths)}
            </section>
            <section>
              <h3>Problems</h3>
              ${htmlList(result.visualProblems)}
            </section>
          </div>
        </div>
      </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Image Quality ${payload.all ? 'All Images' : `Test ${htmlEscape(payload.limit)}`}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f6f3;
      --ink: #20201d;
      --muted: #74746d;
      --line: #dfdfd8;
      --panel: #ffffff;
      --excellent: #0c7a59;
      --good: #2563a8;
      --average: #8a6115;
      --weak: #a84318;
      --bad: #a51d2d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      border-bottom: 1px solid var(--line);
      background: rgba(246, 246, 243, 0.94);
      backdrop-filter: blur(14px);
      padding: 14px 18px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      color: var(--muted);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel);
      padding: 3px 10px;
      color: var(--muted);
      white-space: nowrap;
    }
    .pill.excellent { color: var(--excellent); border-color: color-mix(in srgb, var(--excellent) 32%, var(--line)); }
    .pill.good { color: var(--good); border-color: color-mix(in srgb, var(--good) 32%, var(--line)); }
    .pill.average { color: var(--average); border-color: color-mix(in srgb, var(--average) 32%, var(--line)); }
    .pill.weak { color: var(--weak); border-color: color-mix(in srgb, var(--weak) 32%, var(--line)); }
    .pill.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 32%, var(--line)); }
    main {
      columns: 280px;
      column-gap: 16px;
      padding: 16px;
    }
    .card {
      display: inline-block;
      width: 100%;
      margin: 0 0 16px;
      break-inside: avoid;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 28px rgba(25, 25, 20, 0.07);
    }
    .image-link {
      display: block;
      background: #ecece7;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
    .body {
      padding: 12px;
    }
    .topline {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
    }
    .rank, .tier, .meta, h3 {
      color: var(--muted);
    }
    .score {
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
    }
    .tier {
      margin-left: auto;
      text-transform: capitalize;
    }
    .meta {
      margin-bottom: 8px;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .raw {
      margin: -2px 0 6px;
      color: var(--muted);
      font-size: 11px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 15px;
      line-height: 1.3;
      letter-spacing: 0;
    }
    p {
      margin: 0 0 10px;
      color: #383832;
    }
    .notes {
      display: grid;
      gap: 10px;
    }
    h3 {
      margin: 0 0 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li + li {
      margin-top: 3px;
    }
    .muted {
      color: var(--muted);
    }
    @media (max-width: 680px) {
      header { padding: 12px; }
      main { columns: 1; padding: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Image Quality ${payload.all ? 'All Images' : `Test ${htmlEscape(payload.limit)}`}</h1>
    <div class="summary">
      <span>Average ${htmlEscape(summary.averageScore ?? 'n/a')}</span>
      <span>Scored ${htmlEscape(summary.scored)}/${htmlEscape(summary.total)}</span>
      <span>Failures ${htmlEscape(summary.failures)}</span>
      <span>Model ${htmlEscape(payload.model)}</span>
      ${tierCounts}
    </div>
  </header>
  <main>
    ${cards}
  </main>
</body>
</html>
`;
}

function compactResult(result) {
  const compact = {
    score: result.score,
    tier: result.tier,
    entryId: result.entryId,
    category: result.category,
  };
  if (Number.isFinite(result.rawScore)) compact.rawScore = result.rawScore;
  return compact;
}

function buildRankingData(payload) {
  const ok = payload.results.filter((result) => result.status === 'ok');
  const images = {};
  const groupedByEntry = new Map();

  for (const result of ok) {
    images[result.image] = compactResult(result);
    if (!groupedByEntry.has(result.entryId)) groupedByEntry.set(result.entryId, []);
    groupedByEntry.get(result.entryId).push(result);
  }

  const entries = {};
  for (const [entryId, group] of groupedByEntry) {
    const ranked = [...group].sort((a, b) => b.score - a.score || a.image.localeCompare(b.image));
    const best = ranked[0];
    const averageScore = Math.round((group.reduce((sum, result) => sum + result.score, 0) / group.length) * 10) / 10;
    entries[entryId] = {
      score: best.score,
      rawScore: Number.isFinite(best.rawScore) ? best.rawScore : undefined,
      tier: best.tier,
      bestImage: best.image,
      averageScore,
      scoredImages: group.length,
    };
  }

  return {
    version: VERSION,
    generatedAt: payload.generatedAt,
    model: payload.model,
    scoreSpread: payload.scoreSpread || SCORE_SPREAD,
    complete: payload.all ? payload.summary.failures === 0 && payload.summary.scored === payload.summary.total : false,
    sourceReport: path.relative(ROOT, `${payload.outPrefix || ''}.json`).replace(/^\.\//, ''),
    summary: {
      total: payload.summary.total,
      scored: payload.summary.scored,
      failures: payload.summary.failures,
      averageScore: payload.summary.averageScore,
      tierCounts: payload.summary.tierCounts,
    },
    images,
    entries,
  };
}

async function writeRankingData(payload, opts) {
  const rankingData = buildRankingData({ ...payload, outPrefix: opts.outPrefix });
  await mkdir(path.dirname(opts.rankingDataPath), { recursive: true });
  await writeFile(opts.rankingDataPath, `${JSON.stringify(rankingData, null, 2)}\n`, 'utf-8');
  return opts.rankingDataPath;
}

async function writeReports(payload, opts) {
  const jsonPath = `${opts.outPrefix}.json`;
  const mdPath = `${opts.outPrefix}.md`;
  const htmlPath = `${opts.outPrefix}.html`;
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await writeFile(mdPath, buildMarkdownReport(payload), 'utf-8');
  await writeFile(htmlPath, buildHtmlReport(payload), 'utf-8');
  return { jsonPath, mdPath, htmlPath };
}

function printSummary(summary, paths) {
  console.log('\nSummary');
  console.log(`  Average score: ${summary.averageScore ?? 'n/a'}`);
  console.log(`  Scored: ${summary.scored}/${summary.total}`);
  console.log(`  Failures: ${summary.failures}`);
  console.log(`  Tier counts: ${JSON.stringify(summary.tierCounts)}`);

  console.log('\nTop 10');
  for (const result of summary.top10) {
    console.log(`  ${String(result.score).padStart(3)}  ${result.tier.padEnd(9)}  ${result.category.padEnd(12)}  ${result.image}  ${truncate(result.title, 56)}`);
  }

  console.log('\nBottom 10');
  for (const result of summary.bottom10) {
    console.log(`  ${String(result.score).padStart(3)}  ${result.tier.padEnd(9)}  ${result.category.padEnd(12)}  ${result.image}  ${truncate(result.title, 56)}`);
  }

  console.log('\nReports');
  console.log(`  JSON: ${path.relative(ROOT, paths.jsonPath)}`);
  console.log(`  Markdown: ${path.relative(ROOT, paths.mdPath)}`);
  console.log(`  HTML: ${path.relative(ROOT, paths.htmlPath)}`);
  if (paths.rankingDataPath) {
    console.log(`  Ranking data: ${path.relative(ROOT, paths.rankingDataPath)}`);
  }
}

function buildPayload(opts, selected, results) {
  const summary = summarize(results);
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    model: opts.model,
    ollamaHost: opts.ollamaHost,
    all: opts.all,
    limit: selected.length,
    seed: opts.seed,
    scoreSpread: SCORE_SPREAD,
    rubric: 'Pure visual aesthetics only: composition, lighting, color harmony, clarity, polish, visual impact; penalize blur, artifacts, bad anatomy, clutter, incoherent rendering, and broken text when central. Raw model scores are widened around the configured center to make ranking differences more visible.',
    selected,
    summary,
    results,
  };
}

async function loadResumeResults(opts) {
  if (!opts.resume || !existsSync(`${opts.outPrefix}.json`)) return new Map();
  const payload = JSON.parse(await readFile(`${opts.outPrefix}.json`, 'utf-8'));
  const results = Array.isArray(payload.results) ? payload.results : [];
  return new Map(
    results
      .filter((result) => result.status === 'ok' && result.image)
      .map((result) => [result.image, recalibrateExistingResult(result)])
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  if (opts.fromJson) {
    const payload = JSON.parse(await readFile(opts.fromJson, 'utf-8'));
    if (!Array.isArray(payload.results)) throw new Error(`${opts.fromJson} does not contain a results array.`);
    const results = payload.results.map(recalibrateExistingResult);
    const summary = summarize(results);
    const nextPayload = { ...payload, results, summary, scoreSpread: SCORE_SPREAD };
    const paths = await writeReports(nextPayload, opts);
    if (opts.writeRankingData) {
      paths.rankingDataPath = await writeRankingData(nextPayload, opts);
    }
    console.log(`Regenerated reports from ${path.relative(ROOT, opts.fromJson)}.`);
    printSummary(summary, paths);
    return;
  }

  const entries = await loadEntries();
  const byCategory = collectLocalImageCandidates(entries);
  const selected = opts.all ? chooseAll(byCategory) : chooseSample(byCategory, opts.limit, opts.seed);
  if (!selected.length) throw new Error('No local image candidates found.');

  console.log(`Selected ${selected.length} image(s) across ${categoryNames(byCategory).length} categories.`);
  console.log(`Model: ${opts.model}`);
  console.log(`Ollama: ${opts.ollamaHost}`);
  console.log(`Output: ${path.relative(ROOT, opts.outPrefix)}.{json,md,html}`);
  if (opts.writeRankingData) {
    console.log(`Ranking data: ${path.relative(ROOT, opts.rankingDataPath)}`);
  }

  const results = [];
  const resumed = await loadResumeResults(opts);
  if (resumed.size) {
    console.log(`Resume: reusing ${resumed.size} existing scored image(s).`);
  }

  for (const [index, row] of selected.entries()) {
    process.stdout.write(`[${index + 1}/${selected.length}] ${row.category} ${row.image} ... `);
    const result = resumed.get(row.image) || await scoreImage(row, opts);
    results.push(result);
    if (result.status === 'ok') {
      process.stdout.write(`${result.score} ${result.tier}${resumed.has(row.image) ? ' resumed' : ''}\n`);
    } else {
      process.stdout.write(`ERROR ${result.reason}\n`);
    }

    await writeReports(buildPayload(opts, selected, results), opts);
  }

  const payload = buildPayload(opts, selected, results);
  const paths = await writeReports(payload, opts);
  if (opts.writeRankingData) {
    paths.rankingDataPath = await writeRankingData(payload, opts);
  }

  printSummary(payload.summary, paths);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
