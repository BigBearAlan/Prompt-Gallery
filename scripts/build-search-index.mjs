/**
 * Build a static image-content search index for the gallery.
 *
 * Priority:
 *   1. Reuse YouMind's image-centric `searchIndex` metadata when available
 *   2. Fall back to OpenAI vision for unmatched entries (if accessible)
 *   3. Fall back to prompt-structure heuristics for anything still unmatched
 *
 * Requires:
 *   - OPENAI_API_KEY only for the OpenAI fallback path
 *
 * Run:
 *   node scripts/build-search-index.mjs
 *   node scripts/build-search-index.mjs --force
 *   node scripts/build-search-index.mjs --limit 25
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROMPTS_FILE = path.join(ROOT, 'src', 'data', 'prompts.json');
const INDEX_FILE = path.join(ROOT, 'public', 'search-index.json');

const INDEX_VERSION = 'image-search-v2';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const YOUMIND_API_URL = 'https://youmind.com/youhome-api/prompts';
const YOUMIND_LIMIT = 50;
const YOUMIND_DELAY_MS = 350;
const WRITE_EVERY = 20;
const execFileAsync = promisify(execFile);

const EN_STOPWORDS = new Set([
  'the', 'and', 'with', 'that', 'this', 'from', 'into', 'over', 'under', 'near', 'high',
  'low', 'wide', 'left', 'right', 'center', 'front', 'back', 'style', 'scene', 'image',
  'poster', 'prompt', 'text', 'layout', 'background', 'title', 'description', 'quality',
  'create', 'using', 'showing', 'show', 'include', 'exactly', 'very', 'more', 'like',
  'page', 'panel', 'panels', 'young', 'small', 'large', 'default', 'argument', 'type',
  'brand', 'name', 'subtitle', 'tagline', 'canvas', 'headline', 'caption', 'labels',
  'items', 'position', 'count', 'elements', 'browser', 'top', 'bottom', 'left', 'right',
]);

const ZH_STOPWORDS = new Set([
  '提示词', '生成', '图片', '画面', '风格', '适合', '用于', '感觉', '整体', '布局', '背景',
  '标题', '文本', '元素', '内容', '描述', '场景', '细节', '显示', '使用', '包含', '一张',
  '一个', '一种', '以及', '可以', '具有', '采用', '氛围', '非常', '效果', '图像',
]);

const JA_STOPWORDS = new Set([
  'プロンプト', '画像', 'イメージ', '背景', 'レイアウト', 'スタイル', 'シーン', 'テキスト',
  'タイトル', 'ポスター', 'ページ', 'パネル', '要素', '詳細', '品質', '生成', '使用',
  '表示', '描写', '雰囲気',
]);

function parseArgs(argv) {
  const options = {
    force: false,
    limit: 0,
    concurrency: 4,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--force') options.force = true;
    else if (arg === '--limit') options.limit = Number(next() || 0);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg === '--concurrency') options.concurrency = Number(next() || 4);
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice(14));
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isFinite(options.limit) || options.limit < 0) throw new Error(`Invalid --limit: ${options.limit}`);
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) throw new Error(`Invalid --concurrency: ${options.concurrency}`);
  return options;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values, limit = 16) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const trimmed = String(value || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function sameStringArray(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function buildSearchText(doc) {
  const parts = [
    doc.caption.zh,
    doc.caption.en,
    doc.caption.ja,
    ...doc.keywords.zh,
    ...doc.keywords.en,
    ...doc.keywords.ja,
    ...doc.visibleText,
    ...doc.objects,
  ];

  return uniqueStrings(parts.map(normalizeText).filter(Boolean), 160).join(' ');
}

function detectLowConfidence(doc) {
  const keywordCount = doc.keywords.zh.length + doc.keywords.en.length + doc.keywords.ja.length;
  const textCount = doc.searchText.split(' ').filter(Boolean).length;
  return keywordCount < 3 || textCount < 8;
}

function selectCaption(source, regex, max = 80) {
  const compact = String(source || '').replace(/\s+/g, ' ').trim();
  if (!compact || !regex.test(compact)) return '';
  return compact.slice(0, max);
}

function extractEnglishKeywords(text) {
  const matches = text.match(/[a-z][a-z0-9-]{2,}/gi) || [];
  return uniqueStrings(matches.filter((word) => !EN_STOPWORDS.has(word.toLowerCase())), 40);
}

function extractChineseKeywords(text) {
  const matches = text.match(/[\p{Script=Han}]{2,8}/gu) || [];
  return uniqueStrings(matches.filter((word) => !ZH_STOPWORDS.has(word)), 40);
}

function extractJapaneseKeywords(text) {
  const matches = text.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]{2,14}/gu) || [];
  return uniqueStrings(matches.filter((word) => !JA_STOPWORDS.has(word)), 40);
}

function extractQuotedVisibleText(text) {
  const phrases = [];
  for (const match of String(text || '').matchAll(/"([^"\n]{2,40})"/g)) {
    const value = match[1].trim();
    if (!value) continue;
    if (/^(type|style|layout|title|position|count|labels|scene|description|quality|mood|format)$/i.test(value)) continue;
    if (!/[\p{L}\p{N}]/u.test(value)) continue;
    phrases.push(value);
  }
  return uniqueStrings(phrases, 16);
}

function stripArgumentTemplates(text) {
  return String(text || '').replace(/\{argument[^}]*default=\\?"([^"]+)\\?"[^}]*\}/g, '$1');
}

function collectLeafStrings(value, keyPath = [], out = []) {
  if (typeof value === 'string') {
    out.push({ keyPath, value: stripArgumentTemplates(value) });
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeafStrings(item, [...keyPath, String(index)], out));
    return out;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectLeafStrings(child, [...keyPath, key], out);
    }
  }
  return out;
}

function extractPromptSeedText(prompt) {
  const cleaned = stripArgumentTemplates(prompt);
  try {
    const parsed = JSON.parse(cleaned);
    const leaves = collectLeafStrings(parsed);
    const picked = [];

    for (const leaf of leaves) {
      const key = leaf.keyPath.join('.').toLowerCase();
      const leafKey = key.split('.').at(-1) || '';
      const text = String(leaf.value || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 2) continue;
      if (/^(type|style|quality|mood|format|position|count|layout|rendering|palette|orientation|reading_flow|borders|brand|name|subtitle|tagline|canvas|time|link_text|badge|icon|logo)$/.test(leafKey)) continue;
      if (/(^|\.)(scene|setting|subject|appearance|outfit|background|items|labels|description|image_description|location|props|elements|caption|quote|headline|subheadline|features|character|characters|object|objects|main_image|background_image|subjects)(\.|$)/.test(key)) {
        picked.push(text);
      }
    }

    return uniqueStrings(picked, 80).join(' ');
  } catch {
    if (cleaned.trim().startsWith('{') || cleaned.trim().startsWith('[')) {
      const values = [];
      for (const match of cleaned.matchAll(/:\s*"([^"]+)"/g)) {
        values.push(match[1]);
      }
      return uniqueStrings(values.map(stripArgumentTemplates), 80).join(' ');
    }
    return cleaned;
  }
}

function makeDoc(id, imagePaths, seed) {
  const zhSeed = [seed.description, seed.translatedContent, seed.searchIndex, seed.title].filter(Boolean).join(' ');
  const enSeed = [seed.title, seed.content, seed.searchIndex].filter(Boolean).join(' ');
  const jaSeed = [seed.title, seed.content, seed.searchIndex].filter(Boolean).join(' ');

  const doc = {
    id,
    caption: {
      zh: selectCaption(seed.description || seed.title || '', /[\p{Script=Han}]/u, 60),
      en: selectCaption(seed.title || seed.content || '', /[a-z]/i, 120),
      ja: selectCaption(seed.title || seed.content || '', /[\p{Script=Hiragana}\p{Script=Katakana}]/u, 80),
    },
    keywords: {
      zh: extractChineseKeywords(zhSeed),
      en: extractEnglishKeywords(enSeed),
      ja: extractJapaneseKeywords(jaSeed),
    },
    visibleText: extractQuotedVisibleText(seed.searchIndex || ''),
    objects: extractEnglishKeywords(seed.searchIndex || '').slice(0, 12),
    searchText: '',
    version: INDEX_VERSION,
    imagePaths,
  };

  doc.searchText = buildSearchText(doc);
  return doc;
}

function heuristicDocFromEntry(entry, imagePaths) {
  const title = stripArgumentTemplates(entry.title || '');
  const promptSeed = extractPromptSeedText(entry.prompt || '');
  const combined = [title, promptSeed].filter(Boolean).join(' ');

  const doc = {
    id: entry.id,
    caption: {
      zh: selectCaption(title, /[\p{Script=Han}]/u, 60),
      en: selectCaption(title, /[a-z]/i, 120),
      ja: selectCaption(title, /[\p{Script=Hiragana}\p{Script=Katakana}]/u, 80),
    },
    keywords: {
      zh: extractChineseKeywords(combined),
      en: extractEnglishKeywords(combined),
      ja: extractJapaneseKeywords(combined),
    },
    visibleText: [],
    objects: extractEnglishKeywords(combined).slice(0, 12),
    searchText: '',
    version: INDEX_VERSION,
    imagePaths,
  };

  doc.searchText = buildSearchText(doc);
  return doc;
}

async function writeIndex(index) {
  await mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function fileToDataUrl(filePath) {
  const bytes = await readFile(filePath);
  return `data:${mimeTypeFor(filePath)};base64,${bytes.toString('base64')}`;
}

function extractOutputText(json) {
  if (typeof json.output_text === 'string' && json.output_text.trim()) return json.output_text;

  const parts = [];
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function callOpenAI(entry, imagePaths) {
  const imageInputs = [];
  for (const imagePath of imagePaths) {
    const absolutePath = path.join(ROOT, 'public', imagePath.replace(/^\//, ''));
    await access(absolutePath);
    imageInputs.push({
      type: 'input_image',
      detail: 'auto',
      image_url: await fileToDataUrl(absolutePath),
    });
  }

  const developerPrompt = [
    'You generate image-search metadata for a static gallery.',
    'Use only what is visibly present in the images.',
    'Ignore hidden prompt intent, author names, categories, and metadata unless they are visibly rendered inside the image.',
    'The first image is the primary thumbnail and should influence captions and keywords most strongly.',
    'Be literal, concise, and search-oriented.',
    'If uncertain, omit the term instead of guessing.',
  ].join(' ');

  const userPrompt = [
    `Create aggregated image-search metadata for the gallery entry titled "${entry.title}".`,
    'Return short multilingual captions and keyword lists for what users can visibly search for in the image set.',
    'Prioritize food, animals, objects, scene type, setting, clothing, interfaces, diagrams, and clearly legible in-image text.',
  ].join(' ');

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      caption: {
        type: 'object',
        additionalProperties: false,
        properties: {
          zh: { type: 'string' },
          en: { type: 'string' },
          ja: { type: 'string' },
        },
        required: ['zh', 'en', 'ja'],
      },
      keywords: {
        type: 'object',
        additionalProperties: false,
        properties: {
          zh: { type: 'array', items: { type: 'string' } },
          en: { type: 'array', items: { type: 'string' } },
          ja: { type: 'array', items: { type: 'string' } },
        },
        required: ['zh', 'en', 'ja'],
      },
      visibleText: { type: 'array', items: { type: 'string' } },
      objects: { type: 'array', items: { type: 'string' } },
    },
    required: ['caption', 'keywords', 'visibleText', 'objects'],
  };

  const body = {
    model: 'gpt-4.1-mini',
    input: [
      { role: 'developer', content: [{ type: 'input_text', text: developerPrompt }] },
      { role: 'user', content: [{ type: 'input_text', text: userPrompt }, ...imageInputs] },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'image_search_doc',
        strict: true,
        schema,
      },
    },
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  const json = await response.json();
  const outputText = extractOutputText(json);
  if (!outputText) throw new Error('No output_text in OpenAI response');

  const parsed = JSON.parse(outputText);
  const doc = {
    id: entry.id,
    caption: {
      zh: String(parsed.caption?.zh || '').trim(),
      en: String(parsed.caption?.en || '').trim(),
      ja: String(parsed.caption?.ja || '').trim(),
    },
    keywords: {
      zh: uniqueStrings(parsed.keywords?.zh, 12),
      en: uniqueStrings(parsed.keywords?.en, 12),
      ja: uniqueStrings(parsed.keywords?.ja, 12),
    },
    visibleText: uniqueStrings(parsed.visibleText, 16),
    objects: uniqueStrings(parsed.objects, 16),
    searchText: '',
    version: INDEX_VERSION,
    imagePaths,
  };

  doc.searchText = buildSearchText(doc);
  return doc;
}

async function fetchYouMindPage(page) {
  const requestBody = JSON.stringify({
    model: 'gpt-image-2',
    page,
    limit: YOUMIND_LIMIT,
    locale: 'zh-CN',
    campaign: 'gpt-image-2-prompts',
    filterMode: 'imageCategories',
  });

  const env = { ...process.env };
  for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'all_proxy']) {
    delete env[key];
  }

  const { stdout } = await execFileAsync(
    'curl',
    [
      '--silent',
      '--show-error',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', 'User-Agent: Mozilla/5.0 (compatible; PromptGallery/1.0)',
      '-H', 'Referer: https://youmind.com/zh-CN/gpt-image-2-prompts',
      '-H', 'Accept-Language: zh-CN',
      '-d', requestBody,
      '-w', '\n%{http_code}',
      YOUMIND_API_URL,
    ],
    { env, maxBuffer: 20 * 1024 * 1024 }
  );

  const lines = stdout.split('\n');
  const status = Number(lines.pop() || 0);
  const text = lines.join('\n');

  if (status < 200 || status >= 300) {
    return { status, prompts: [], hasMore: false, totalPages: 0, bodyText: text };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { status, prompts: [], hasMore: false, totalPages: 0, bodyText: text };
  }

  return {
    status,
    prompts: json.prompts || [],
    hasMore: json.hasMore ?? false,
    totalPages: json.totalPages || 0,
    total: json.total || 0,
    bodyText: text,
  };
}

async function buildYouMindMap(targetIds) {
  const map = new Map();
  let page = 1;
  let totalPages = Infinity;
  let retries = 0;

  while (page <= totalPages) {
    const result = await fetchYouMindPage(page);

    if (result.status === 429 || result.status >= 500 || result.bodyText.startsWith('<!doctype html>')) {
      retries += 1;
      if (retries > 1) {
        console.warn(`YouMind API stopped after repeated failures at page ${page}.`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, YOUMIND_DELAY_MS * retries * 3));
      continue;
    }

    retries = 0;
    totalPages = result.totalPages || page;

    for (const prompt of result.prompts) {
      const link = String(prompt.sourceLink || '').split('#')[0];
      const match = link.match(/status\/(\d+)/);
      if (!match) continue;
      const tweetId = match[1];
      if (!targetIds.has(tweetId) || map.has(tweetId)) continue;
      map.set(tweetId, prompt);
    }

    process.stdout.write(`\rYouMind coverage: ${map.size}/${targetIds.size} (page ${page}/${totalPages})   `);
    if (map.size === targetIds.size) break;

    if (!result.hasMore && page >= totalPages) break;
    page += 1;
    await new Promise((resolve) => setTimeout(resolve, YOUMIND_DELAY_MS));
  }

  process.stdout.write('\n');
  return map;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = await readJson(PROMPTS_FILE, []);
  const existing = await readJson(INDEX_FILE, { version: INDEX_VERSION, generatedAt: '', entries: {} });
  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    entries: existing.entries || {},
  };

  const targets = [];
  let skipped = 0;

  for (const entry of entries) {
    const imagePaths = uniqueStrings(
      [entry.thumbnail, ...(entry.outputImages || [])].filter((value) => String(value || '').startsWith('/images/')),
      8
    );

    const existingDoc = index.entries[entry.id];
    if (!options.force && existingDoc?.version === INDEX_VERSION && sameStringArray(existingDoc.imagePaths || [], imagePaths)) {
      skipped++;
      continue;
    }

    targets.push({ entry, imagePaths });
  }

  const slicedTargets = options.limit > 0 ? targets.slice(0, options.limit) : targets;
  const targetIds = new Set(slicedTargets.map(({ entry }) => entry.id));

  console.log(`Entries: ${entries.length}`);
  console.log(`Skipped existing: ${skipped}`);
  console.log(`To index: ${slicedTargets.length}`);
  console.log(`Concurrency: ${options.concurrency}`);

  const youMindMap = await buildYouMindMap(targetIds);
  console.log(`YouMind matches: ${youMindMap.size}/${targetIds.size}`);

  let openAiUnavailable = false;
  let nextIndex = 0;
  let processed = 0;
  let fromYouMind = 0;
  let fromOpenAI = 0;
  let fromFallback = 0;
  const lowConfidence = [];

  async function worker() {
    while (nextIndex < slicedTargets.length) {
      const current = slicedTargets[nextIndex++];
      const { entry, imagePaths } = current;
      const youMindPrompt = youMindMap.get(entry.id);

      let doc = null;
      let source = 'fallback';

      if (youMindPrompt?.searchIndex) {
        doc = makeDoc(entry.id, imagePaths, {
          title: youMindPrompt.title,
          description: youMindPrompt.description,
          content: youMindPrompt.content,
          translatedContent: youMindPrompt.translatedContent,
          searchIndex: youMindPrompt.searchIndex,
        });
        source = 'youmind';
      } else if (!openAiUnavailable && process.env.OPENAI_API_KEY) {
        try {
          doc = await callOpenAI(entry, imagePaths);
          source = 'openai';
        } catch (error) {
          const body = String(error.body || error.message || '');
          if (error.status === 403 && body.includes('unsupported_country_region_territory')) {
            openAiUnavailable = true;
            console.warn('OpenAI vision indexing is unavailable in this environment; falling back to non-OpenAI indexing.');
          }
        }
      }

      if (!doc) {
        doc = heuristicDocFromEntry(entry, imagePaths);
        source = 'fallback';
      }

      if (source === 'youmind') fromYouMind++;
      else if (source === 'openai') fromOpenAI++;
      else fromFallback++;

      if (detectLowConfidence(doc)) lowConfidence.push(entry.id);
      // Preserve vision labels from the previous index entry — they come from
      // build-vision-labels.mjs and are independent of text metadata.
      const prevVisionLabels = existing.entries?.[entry.id]?.visionLabels;
      if (prevVisionLabels) doc.visionLabels = prevVisionLabels;
      index.entries[entry.id] = doc;
      processed++;
      console.log(`[${source}] ${processed}/${slicedTargets.length} ${entry.id} ${entry.title.slice(0, 48)}`);

      if (processed % WRITE_EVERY === 0 || processed === slicedTargets.length) {
        index.generatedAt = new Date().toISOString();
        await writeIndex(index);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, worker));

  index.generatedAt = new Date().toISOString();
  await writeIndex(index);

  console.log('\nDone.');
  console.log(`From YouMind: ${fromYouMind}`);
  console.log(`From OpenAI: ${fromOpenAI}`);
  console.log(`Fallback only: ${fromFallback}`);
  console.log(`Low-confidence docs: ${lowConfidence.length}`);
  if (lowConfidence.length > 0) {
    console.log(`Low-confidence IDs: ${lowConfidence.join(', ')}`);
  }
  console.log(`Index written to ${INDEX_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
