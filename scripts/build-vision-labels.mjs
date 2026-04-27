#!/usr/bin/env node
/**
 * Vision-based search label generator for the gallery.
 *
 * Uses a local Ollama vision model to look at each thumbnail and produce
 * accurate semantic search keywords in English and Chinese — the actual
 * subjects, scene, and style a user would type to find the image.
 *
 * Results are stored as `visionLabels` inside public/search-index.json.
 * Run build-search-index.mjs first to create base entries; this script
 * then enriches them with ground-truth visual content.
 *
 * Usage:
 *   node scripts/build-vision-labels.mjs [options]
 *
 * Options:
 *   --all              Label all entries (skips already-labeled by default)
 *   --force            Re-label even entries that already have visionLabels
 *   --limit <n>        Process at most n entries
 *   --model <name>     Ollama model (default: gemma4:e4b)
 *   --ollama-host <u>  Ollama base URL (default: http://localhost:11434)
 *   --timeout-ms <n>   Per-image timeout ms (default: 60000)
 *   --concurrency <n>  Parallel Ollama requests (default: 1)
 *   --no-recategorize  Skip writing AI category back to prompts.json
 *   --help             Show this help
 *
 * Examples:
 *   node scripts/build-vision-labels.mjs --limit 50
 *   node scripts/build-vision-labels.mjs --all --model gemma4:e4b
 *   node scripts/build-vision-labels.mjs --force --limit 20
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(__dirname, '..');
const PROMPTS_FILE = path.join(ROOT, 'src', 'data', 'prompts.json');
const INDEX_FILE   = path.join(ROOT, 'public', 'search-index.json');

const LABELS_VERSION      = 'vl-v2'; // bump to force re-label on prompt change
const DEFAULT_MODEL       = 'gemma4:e4b';
const DEFAULT_HOST        = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS  = 180_000;
const DEFAULT_CONCURRENCY = 1;
const WRITE_EVERY         = 10;

const VALID_STYLES = new Set([
  'photography', 'anime', 'illustration', 'watercolor',
  '3d-render', 'ui-design', 'logo', 'infographic', 'poster', 'other',
]);

const VALID_CATEGORIES = new Set([
  'manga', 'advertising', 'game', 'portrait', 'photography',
  'poster', 'illustration', 'ui', 'infographic', 'logo', 'other',
]);

// ── CLI ───────────────────────────────────────────────────────────────────────

function usage() {
  console.log(`
Vision-based search label generator.

Analyzes each gallery thumbnail with an Ollama vision model and writes accurate
semantic search keywords (subjects, scene, style) into public/search-index.json
as a "visionLabels" field per entry.

Usage:
  node scripts/build-vision-labels.mjs [options]

Options:
  --all              Label all entries (skips already-labeled by default)
  --force            Re-label even entries that already have visionLabels
  --limit <n>        Process at most n entries
  --model <name>     Ollama model (default: ${DEFAULT_MODEL})
  --ollama-host <u>  Ollama base URL (default: ${DEFAULT_HOST})
  --timeout-ms <n>   Per-image timeout ms (default: ${DEFAULT_TIMEOUT_MS})
  --concurrency <n>  Parallel requests (default: ${DEFAULT_CONCURRENCY})
  --no-recategorize  Skip writing AI category back to prompts.json
  --help             Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    all: false,
    force: false,
    limit: 0,
    model: DEFAULT_MODEL,
    host: DEFAULT_HOST,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    recategorize: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--all')             opts.all = true;
    else if (arg === '--force')           opts.force = true;
    else if (arg === '--no-recategorize') opts.recategorize = false;
    else if (arg === '--limit')        opts.limit       = Number(next());
    else if (arg.startsWith('--limit='))       opts.limit       = Number(arg.slice(8));
    else if (arg === '--model')        opts.model       = next();
    else if (arg.startsWith('--model='))       opts.model       = arg.slice(8);
    else if (arg === '--ollama-host')  opts.host        = next();
    else if (arg.startsWith('--ollama-host=')) opts.host        = arg.slice(14);
    else if (arg === '--timeout-ms')   opts.timeoutMs   = Number(next());
    else if (arg.startsWith('--timeout-ms='))  opts.timeoutMs   = Number(arg.slice(13));
    else if (arg === '--concurrency')  opts.concurrency = Number(next());
    else if (arg.startsWith('--concurrency=')) opts.concurrency = Number(arg.slice(14));
    else throw new Error(`Unknown option: ${arg}`);
  }

  opts.host = opts.host.replace(/\/$/, '');
  return opts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function localImagePath(src) {
  if (!src || /^https?:\/\//i.test(src)) return '';
  if (src.startsWith('/')) return path.join(ROOT, 'public', src.slice(1));
  return path.resolve(ROOT, src);
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png')  return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif')  return 'image/gif';
  return 'image/jpeg';
}

async function toBase64(filePath) {
  const bytes = await readFile(filePath);
  return bytes.toString('base64');
}

function uniqueStrings(arr, max = 20) {
  const seen = new Set();
  const out  = [];
  for (const v of arr || []) {
    const s = String(v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt() {
  return `You are a visual analyst for an AI-generated image gallery. Examine this image carefully.

Your output will power two systems:
1. Search — users type terms like "dog", "watercolor portrait", "anime girl", "cyberpunk city"
2. Category classification — the image is filed under exactly one gallery category

WHAT TO INCLUDE IN KEYWORDS:
• Main subjects — people, animals, objects, food (be specific: "golden retriever", not just "animal")
• Scene or setting — where the action takes place (park, kitchen, space, underwater)
• Visual style — how the image was made (photography, anime, watercolor, 3d-render, logo, etc.)
• Distinctive attributes — notable colors, mood, lighting, composition (neon, dark, minimalist, aerial view)

RULES:
• Only describe what is VISIBLY present — no prompt engineering meta-comments
• Include BOTH specific ("golden retriever") AND general ("dog") terms
• Skip OCR text and brand names unless the text IS the main visual subject (e.g. a logo design)
• Provide 10-18 English keywords covering subjects, scene, style, and mood
• Provide 8-14 Chinese keywords (same concepts, translated naturally)
• "style" must be exactly one of: photography, anime, illustration, watercolor, 3d-render, ui-design, logo, infographic, poster, other
• "scene" is a short 2-5 word English phrase describing the setting
• "category" must be exactly one of: manga, advertising, game, portrait, photography, poster, illustration, ui, infographic, logo, other
  - manga: anime/manga art style, comics, cartoon characters
  - advertising: product ads, brand campaigns, commercial imagery
  - game: video game scenes, game UI, characters from games
  - portrait: realistic or stylized depictions of a person's face/upper body
  - photography: photo-realistic or actual photographic style
  - poster: movie/event posters, large typographic designs, promotional art
  - illustration: digital or hand-drawn illustration not matching above styles
  - ui: app/web interface designs, dashboards, wireframes
  - infographic: data visualizations, charts, diagrams with text
  - logo: brand marks, icon designs, wordmarks
  - other: none of the above fits clearly

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON:
{"en":["keyword1","keyword2"],"zh":["关键词1","关键词2"],"style":"photography","scene":"puppy in park","category":"portrait"}`;
}

// ── Ollama call ───────────────────────────────────────────────────────────────

function extractJson(text) {
  let s = String(text || '').trim();
  // Strip <think>...</think> reasoning blocks (Qwen / DeepSeek thinking models)
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try { return JSON.parse(s); } catch {}

  const first = s.indexOf('{');
  const last  = s.lastIndexOf('}');
  if (first === -1 || last <= first) {
    const preview = s.slice(0, 200).replace(/\n/g, '\\n');
    throw new Error(`No JSON object found in response. Raw: ${preview}`);
  }
  return JSON.parse(s.slice(first, last + 1));
}

function normalizeLabels(raw, entryId) {
  const en = uniqueStrings(Array.isArray(raw.en) ? raw.en : [], 20);
  const zh = uniqueStrings(Array.isArray(raw.zh) ? raw.zh : [], 16);
  const style    = VALID_STYLES.has(raw.style) ? raw.style : 'other';
  const scene    = typeof raw.scene === 'string' ? raw.scene.trim().slice(0, 80) : '';
  const category = VALID_CATEGORIES.has(raw.category) ? raw.category : null;

  if (en.length < 3) throw new Error(`Too few English keywords (${en.length}) for entry ${entryId}`);
  return { en, zh, style, scene, category, version: LABELS_VERSION };
}

async function callOllama(imagePath, entryId, opts) {
  const base64 = await toBase64(imagePath);

  const res = await fetch(`${opts.host}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      format: 'json',
      think: false,
      messages: [{
        role: 'user',
        content: buildPrompt(),
        images: [base64],
      }],
      options: { temperature: 0, num_predict: 2000 },
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);

  const json    = body ? JSON.parse(body) : {};
  const content = json.message?.content || json.response || '';
  return normalizeLabels(extractJson(content), entryId);
}

// ── Index I/O ─────────────────────────────────────────────────────────────────

async function writeIndex(index) {
  await mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function writePrompts(entries) {
  await writeFile(PROMPTS_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { usage(); return; }

  // Load data
  const entries = JSON.parse(await readFile(PROMPTS_FILE, 'utf-8'));
  const index   = await readJson(INDEX_FILE, { version: 'image-search-v2', generatedAt: '', entries: {} });
  if (!index.entries) index.entries = {};

  // Build an id→entry map for fast category writes
  const entryById = new Map(entries.map(e => [e.id, e]));

  // Collect targets
  const targets = [];
  for (const entry of entries) {
    if (entry.pending) continue;

    // Find primary local image (thumbnail preferred, fallback to first outputImage)
    const candidates = [entry.thumbnail, ...(entry.outputImages || [])];
    let imageSrc = null;
    for (const src of candidates) {
      if (!src || !String(src).startsWith('/images/')) continue;
      const fp = localImagePath(src);
      if (fp && existsSync(fp)) { imageSrc = src; break; }
    }
    if (!imageSrc) continue; // no local image — skip

    // Skip if already labeled at current version (unless --force)
    if (!opts.force) {
      const existing = index.entries[entry.id]?.visionLabels;
      if (existing?.version === LABELS_VERSION) continue;
    }

    targets.push({ entry, imageSrc, imagePath: localImagePath(imageSrc) });
  }

  const sliced = opts.limit > 0 ? targets.slice(0, opts.limit) : targets;

  console.log(`Entries in gallery:   ${entries.filter(e => !e.pending).length}`);
  console.log(`Targets to label:     ${sliced.length}`);
  console.log(`Recategorize:         ${opts.recategorize ? 'yes' : 'no'}`);
  console.log(`Model:                ${opts.model}`);
  console.log(`Ollama:               ${opts.host}`);
  console.log(`Concurrency:          ${opts.concurrency}`);
  console.log(`Index:                ${path.relative(ROOT, INDEX_FILE)}`);
  if (sliced.length === 0) { console.log('\nNothing to do — all entries already labeled.'); return; }
  console.log('');

  let nextIdx        = 0;
  let processed      = 0;
  let ok             = 0;
  let errors         = 0;
  let recategorized  = 0;

  async function worker() {
    while (nextIdx < sliced.length) {
      const { entry, imagePath } = sliced[nextIdx++];
      const label = `[${processed + 1}/${sliced.length}]`;
      process.stdout.write(`${label} ${entry.id} ${(entry.title || '').slice(0, 48)} ... `);

      try {
        const labels = await callOllama(imagePath, entry.id, opts);

        // Ensure the doc exists in the index
        if (!index.entries[entry.id]) {
          index.entries[entry.id] = {
            id: entry.id,
            caption: { zh: '', en: '', ja: '' },
            keywords: { zh: [], en: [], ja: [] },
            visibleText: [],
            objects: [],
            searchText: '',
            version: 'image-search-v2',
            imagePaths: [imagePath.replace(path.join(ROOT, 'public'), '')],
          };
        }

        index.entries[entry.id].visionLabels = labels;

        // Update category in prompts.json when the model returned a valid one
        let catNote = '';
        if (opts.recategorize && labels.category) {
          const promptEntry = entryById.get(entry.id);
          if (promptEntry && promptEntry.category !== labels.category) {
            const oldCat = promptEntry.category;
            promptEntry.category = labels.category;
            recategorized++;
            catNote = ` | ${oldCat}→${labels.category}`;
          }
        }

        ok++;
        process.stdout.write(`✓ ${labels.style} | ${labels.en.slice(0, 4).join(', ')}${catNote}\n`);
      } catch (err) {
        errors++;
        process.stdout.write(`✗ ${String(err.message).slice(0, 120)}\n`);
      }

      processed++;

      if (processed % WRITE_EVERY === 0 || processed === sliced.length) {
        index.generatedAt = new Date().toISOString();
        await writeIndex(index);
        if (opts.recategorize) await writePrompts(entries);
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, worker));

  index.generatedAt = new Date().toISOString();
  await writeIndex(index);
  if (opts.recategorize) await writePrompts(entries);

  console.log(`\nDone.`);
  console.log(`Labeled:        ${ok}`);
  console.log(`Errors:         ${errors}`);
  if (opts.recategorize) console.log(`Recategorized:  ${recategorized}`);
  console.log(`Index:          ${path.relative(ROOT, INDEX_FILE)}`);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
