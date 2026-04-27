/**
 * PromptCanvas Admin Server
 * Run:  node scripts/admin.mjs
 * Open: http://localhost:3001
 */

import { createServer } from 'http';
import { readFile, writeFile, stat, mkdir } from 'fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(__dirname, '..');
const PROMPTS_FILE  = path.join(ROOT, 'src', 'data', 'prompts.json');
const QUALITY_FILE  = path.join(ROOT, 'src', 'data', 'image-quality.json');
const IMAGES_DIR    = path.join(ROOT, 'public', 'images');
const HTML_FILE    = path.join(__dirname, 'admin.html');
const PORT         = 3001;

let deployLocked = false;

// ── helpers ───────────────────────────────────────────────────────────────────

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getBody(req) {
  return getRawBody(req).then(buf => {
    try { return JSON.parse(buf.toString() || 'null'); }
    catch { return null; }
  });
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp',
  '.gif': 'image/gif',  '.html': 'text/html; charset=utf-8',
};

// SSE helper for the admin deploy stream.
function sseSetup(res) {
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => {
    if (!res.writableEnded)
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const runStep = (cmd, args, label, req) => new Promise(resolve => {
    send('log', { text: `\n▶ ${label}\n` });
    const child = spawn(cmd, args, { cwd: ROOT, shell: true, env: process.env });
    child.stdout.on('data', d => send('log', { text: d.toString() }));
    child.stderr.on('data', d => send('log', { text: d.toString() }));
    child.on('close', code => resolve(code));
    req.on('close', () => child.kill());
  });
  return { send, runStep };
}

// ── X/Twitter import helpers ──────────────────────────────────────────────────

function extractTweetId(url) {
  const m = url.match(/status\/(\d+)/);
  return m ? m[1] : null;
}

function extractTweetUsername(url) {
  const m = url.match(/x\.com\/([^/]+)\/status/);
  return m ? m[1] : 'unknown';
}

function syndicationToken(idStr) {
  const n = Number(idStr) / 1e15;
  return Math.floor(n * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

async function fetchTweetData(id) {
  const token  = syndicationToken(id);
  const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://platform.twitter.com/',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.error(`[import] HTTP ${res.status} for tweet ${id}`); return null; }
    return await res.json();
  } catch (e) {
    console.error(`[import] Fetch error for tweet ${id}: ${e.message}`);
    return null;
  }
}

function extractTweetImages(data) {
  const imgs = [];
  if (Array.isArray(data.photos)) {
    for (const p of data.photos) {
      const base = p.url || p.media_url_https;
      if (base) imgs.push(`${base}?format=jpg&name=large`);
    }
  }
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

function getTweetAspect(data) {
  const src =
    (Array.isArray(data.photos)       && data.photos[0]) ||
    (Array.isArray(data.mediaDetails) && data.mediaDetails[0]) ||
    null;
  if (!src) return 1.33;
  const w = src.width  || src.original_info?.width  || 0;
  const h = src.height || src.original_info?.height || 0;
  return w > 0 && h > 0 ? parseFloat((h / w).toFixed(4)) : 1.33;
}

function cleanTweetText(text = '') {
  return text
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/https?:\/\/pic\.x\.com\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectTweetLang(text = '') {
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';
  return 'en';
}

function truncateTweetTitle(text, max = 80) {
  if (!text) return '';
  const first = text.split('\n').find(l => l.trim()) || text;
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}

async function downloadTweetImage(imgUrl, dest) {
  if (existsSync(dest)) return true;
  try {
    const res = await fetch(imgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PromptGallery/1.0)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok || !res.body) return false;
    await pipeline(res.body, createWriteStream(dest));
    return true;
  } catch (e) {
    console.error(`[import] Image download failed: ${e.message}`);
    return false;
  }
}

// Public bearer token from Twitter's own web app — used for unauthenticated public reads.
const TWITTER_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

async function getTwitterGuestToken() {
  try {
    const res = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${TWITTER_BEARER}` },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.guest_token || null;
  } catch { return null; }
}

// Extract all available text from a syndication API response object.
function extractAllTweetText(data) {
  const parts = [];
  const main = data.text || data.full_text || '';
  if (main) parts.push(cleanTweetText(main));

  // Twitter Notes (long-form tweets use a separate field)
  const note = data.note_tweet?.note_tweet_results?.result?.text || '';
  if (note && note !== main) parts.push(cleanTweetText(note));

  // Quoted tweet
  const qt =
    data.quoted_status?.full_text ||
    data.quoted_status?.text      ||
    data.quotedTweet?.full_text   ||
    data.quotedTweet?.text        ||
    '';
  if (qt) parts.push(`[Quoted tweet]: ${cleanTweetText(qt)}`);

  return parts.filter(Boolean);
}

// Follow in_reply_to chain upward (useful when the image IS a reply to a prompt post).
async function fetchParentTweets(data, maxDepth = 3) {
  const parentTexts = [];
  let current = data;
  for (let i = 0; i < maxDepth; i++) {
    const parentId = String(current.in_reply_to_status_id_str || current.in_reply_to_status_id || '');
    if (!parentId || parentId === 'null' || parentId === '0') break;
    await new Promise(r => setTimeout(r, 400));
    const parent = await fetchTweetData(parentId);
    if (!parent) break;
    const pTexts = extractAllTweetText(parent);
    if (pTexts.length) {
      const handle = parent.user?.screen_name || '?';
      parentTexts.unshift(`[@${handle}]: ${pTexts.join(' ')}`);
    }
    current = parent;
  }
  return parentTexts;
}

// Fetch the author's own replies to the given tweet (self-thread pattern).
async function fetchSelfReplies(tweetId, username, guestToken) {
  if (!guestToken) return [];
  try {
    const url = 'https://api.twitter.com/1.1/statuses/user_timeline.json' +
      `?screen_name=${encodeURIComponent(username)}&count=20` +
      '&tweet_mode=extended&exclude_replies=false&trim_user=false';
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TWITTER_BEARER}`,
        'x-guest-token': guestToken,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://twitter.com/',
        'Origin':  'https://twitter.com',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const tweets = await res.json();
    if (!Array.isArray(tweets)) return [];
    return tweets
      .filter(t => t.in_reply_to_status_id_str === tweetId)
      .map(t => cleanTweetText(t.full_text || t.text || ''))
      .filter(Boolean);
  } catch (e) {
    console.error(`[import] fetchSelfReplies: ${e.message}`);
    return [];
  }
}

// Assemble the richest possible text context for Ollama: main tweet + parents + self-replies.
async function assembleTweetContext(data, tweetUrl, guestToken) {
  const parts = extractAllTweetText(data);

  // Walk up the reply chain (handles "image is a reply to a prompt post" pattern)
  const parentTexts = await fetchParentTweets(data);
  if (parentTexts.length) parts.unshift(...parentTexts);

  // Fetch author's own reply thread (handles "prompt posted as self-reply" pattern)
  const username    = extractTweetUsername(tweetUrl);
  const tweetId     = String(data.id_str || data.id || extractTweetId(tweetUrl) || '');
  const selfReplies = await fetchSelfReplies(tweetId, username, guestToken);
  if (selfReplies.length) {
    parts.push(...selfReplies.map(r => `[Reply by @${username}]: ${r}`));
    console.log(`[import] +${selfReplies.length} self-repl(ies) for tweet ${tweetId}`);
  }

  return parts.join('\n\n');
}

const VALID_IMPORT_CATEGORIES = new Set([
  'manga','advertising','game','portrait','photography',
  'poster','illustration','ui','infographic','logo','other',
]);

async function extractPromptWithOllama(imageBase64s, fullText) {
  const userContent =
    `The following is a tweet about an AI-generated image:\n\n---\n${fullText}\n---\n\n` +
    `Look at the image(s) and the tweet text. Extract the AI image generation prompt that was used to create these images.\n\n` +
    `Return JSON only:\n{"prompt":"the complete prompt text used to generate the image","title":"short descriptive title under 80 chars","category":"one of: manga/advertising/game/portrait/photography/poster/illustration/ui/infographic/logo/other"}`;

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    'qwen2.5vl:7b',
        messages: [{ role: 'user', content: userContent, images: imageBase64s.slice(0, 4) }],
        format:   'json',
        stream:   false,
        options:  { num_predict: 3000, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) return null;
    const data    = await res.json();
    const raw     = data.message?.content || '';
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const m       = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  } catch (e) {
    console.error(`[import] Ollama error: ${e.message}`);
    return null;
  }
}

// ── server ────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url   = new URL(req.url, `http://localhost:${PORT}`);
  const path_ = url.pathname;

  try {
    // ── GET / ──
    if (path_ === '/' && req.method === 'GET') {
      const html = await readFile(HTML_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // ── GET /api/prompts ──
    if (path_ === '/api/prompts' && req.method === 'GET') {
      const raw = await readFile(PROMPTS_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
      return;
    }

    // ── PUT /api/prompts ──
    if (path_ === '/api/prompts' && req.method === 'PUT') {
      const prompts = await getBody(req);
      if (!Array.isArray(prompts)) { json(res, { error: 'Expected array' }, 400); return; }
      await writeFile(PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf-8');
      console.log(`[admin] Saved ${prompts.length} entries → prompts.json`);
      json(res, { ok: true, count: prompts.length });
      return;
    }

    // ── POST /api/upload  (image file as base64 JSON) ──
    if (path_ === '/api/upload' && req.method === 'POST') {
      const body = await getBody(req);
      if (!body || !body.filename || !body.data) {
        json(res, { error: 'Missing filename or data' }, 400); return;
      }

      // Sanitise filename — only allow safe characters and known image extensions
      const safeName = path.basename(body.filename).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const ext = path.extname(safeName).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        json(res, { error: 'Unsupported file type' }, 400); return;
      }

      // Decode base64 data URL
      const match = body.data.match(/^data:image\/[^;]+;base64,(.+)$/s);
      if (!match) { json(res, { error: 'Invalid image data' }, 400); return; }

      const imageBuffer = Buffer.from(match[1], 'base64');
      const destPath    = path.join(IMAGES_DIR, safeName);

      // Guard against directory traversal
      if (!destPath.startsWith(IMAGES_DIR)) { res.writeHead(403); res.end(); return; }

      await writeFile(destPath, imageBuffer);
      console.log(`[admin] Uploaded image → ${safeName} (${imageBuffer.length} bytes)`);
      json(res, { ok: true, path: `/images/${safeName}` });
      return;
    }

    // ── GET /api/quality ──
    if (path_ === '/api/quality' && req.method === 'GET') {
      const raw = await readFile(QUALITY_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
      return;
    }

    // ── POST /api/import/tweet  (SSE: syndication fetch + download + Ollama → prompts.json) ──
    if (path_ === '/api/import/tweet' && req.method === 'POST') {
      const body = await getBody(req);
      const urls = (body?.urls || [])
        .filter(u => typeof u === 'string' && /x\.com\/.+\/status\/\d+/.test(u));

      if (urls.length === 0) {
        json(res, { error: 'No valid X/Twitter status URLs provided' }, 400);
        return;
      }

      const { send } = sseSetup(res);

      try {
        await mkdir(IMAGES_DIR, { recursive: true });
        const existing    = JSON.parse(await readFile(PROMPTS_FILE, 'utf-8'));
        const existingIds = new Set(existing.map(e => e.id));
        const added       = [];

        // Acquire once; reused across all tweets in this batch
        const guestToken = await getTwitterGuestToken();
        console.log(`[import] Guest token: ${guestToken ? 'OK' : 'unavailable (self-replies skipped)'}`);

        for (const tweetUrl of urls) {
          const id       = extractTweetId(tweetUrl);
          const username = extractTweetUsername(tweetUrl);

          if (!id) {
            send('status', { url: tweetUrl, status: 'error', message: '无法提取推文 ID' });
            continue;
          }
          if (existingIds.has(id)) {
            send('status', { url: tweetUrl, status: 'skip', message: '已存在，跳过' });
            continue;
          }

          send('status', { url: tweetUrl, status: 'fetching', message: '获取推文数据…' });
          const data = await fetchTweetData(id);
          if (!data) {
            send('status', { url: tweetUrl, status: 'error', message: '获取推文失败（可能已删除）' });
            continue;
          }

          const imageUrls = extractTweetImages(data);
          if (imageUrls.length === 0) {
            send('status', { url: tweetUrl, status: 'error', message: '推文无图片，跳过' });
            continue;
          }

          send('status', { url: tweetUrl, status: 'downloading', message: `下载图片 (${imageUrls.length} 张)…` });
          const localImages = [];
          for (let i = 0; i < imageUrls.length; i++) {
            const dest    = path.join(IMAGES_DIR, `${id}_${i}.jpg`);
            const webPath = `/images/${id}_${i}.jpg`;
            const ok = await downloadTweetImage(imageUrls[i], dest);
            localImages.push(ok ? webPath : imageUrls[i]);
          }

          // Load downloaded images as base64 for Ollama vision
          const imageBase64s = [];
          for (const localPath of localImages) {
            if (!localPath.startsWith('/images/')) continue;
            try {
              const buf = await readFile(path.join(ROOT, 'public', localPath));
              imageBase64s.push(buf.toString('base64'));
            } catch { /* skip */ }
          }

          // mainText is for title/lang fallbacks; fullText is the rich context sent to Ollama
          const mainText = cleanTweetText(data.text || data.full_text || '');
          const author   = data.user?.name
            || data.core?.user_results?.result?.legacy?.name
            || username;

          send('status', { url: tweetUrl, status: 'analyzing', message: 'AI 分析图片 + 提取提示词 (qwen2.5vl)…' });

          const fullText = await assembleTweetContext(data, tweetUrl, guestToken);
          const aiResult  = await extractPromptWithOllama(imageBase64s, fullText);
          const rawPrompt = aiResult?.prompt;
          const prompt    = (typeof rawPrompt === 'string' && rawPrompt.trim()) ? rawPrompt : mainText;
          const aiTitle  = aiResult?.title  || null;
          const aiCat    = VALID_IMPORT_CATEGORIES.has(aiResult?.category) ? aiResult.category : 'other';
          const lang     = detectTweetLang(prompt || mainText);

          const entry = {
            id,
            title:           aiTitle || truncateTweetTitle(mainText || `Tweet by @${username}`),
            thumbnail:       localImages[0] || '',
            thumbnailAspect: getTweetAspect(data),
            author,
            authorUrl:       `https://x.com/${username}`,
            tags:            [lang, aiCat].filter(Boolean),
            category:        aiCat,
            lang,
            stats: {
              likes:    data.favorite_count ?? 0,
              retweets: data.retweet_count  ?? 0,
              views:    data.views?.count   ? Number(data.views.count) : 0,
            },
            createdAt:    data.created_at || '',
            prompt,
            outputImages: localImages,
            sourceUrl:    tweetUrl,
            pending:      true,
          };

          added.push(entry);
          existingIds.add(id);
          send('status', {
            url:     tweetUrl,
            status:  'done',
            message: `OK — "${(aiTitle || truncateTweetTitle(mainText)).slice(0, 45)}"`,
          });
        }

        if (added.length > 0) {
          await writeFile(PROMPTS_FILE, JSON.stringify([...existing, ...added], null, 2), 'utf-8');
          console.log(`[import] Added ${added.length} tweet(s) to prompts.json`);
        }

        send('done', { ok: true, added: added.length, total: urls.length });
      } catch (err) {
        console.error('[import] Error:', err);
        send('done', { ok: false, error: err.message });
      }

      res.end();
      return;
    }

    // ── GET /api/deploy/status ──
    if (path_ === '/api/deploy/status' && req.method === 'GET') {
      json(res, { ok: true, target: 'vercel' });
      return;
    }

    // ── GET /api/deploy/vercel  (SSE: build check + git push → Vercel) ──
    if (path_ === '/api/deploy/vercel' && req.method === 'GET') {
      if (deployLocked) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'A deploy is already in progress.' }));
        return;
      }
      deployLocked = true;
      const { send, runStep } = sseSetup(res);

      const finish = (payload) => { deployLocked = false; send('done', payload); res.end(); };

      const cleanIndexCode = await runStep('git', ['diff', '--cached', '--quiet'], 'Check for pre-staged changes', req);
      if (cleanIndexCode !== 0) {
        finish({ ok: false, error: 'There are already staged git changes. Commit or unstage them before using admin deploy.' });
        return;
      }

      // Remove previous static export to avoid ENOTEMPTY errors from Next.js
      await runStep('rm', ['-rf', 'out'], 'clean previous export', req);

      const buildCode = await runStep('npm', ['run', 'build'], 'npm run build', req);
      if (buildCode !== 0) {
        finish({ ok: false, error: `Build exited ${buildCode}` });
        return;
      }

      // Stage all tracked modifications (source code, data, scripts) + new images.
      // git add -u only stages files git already tracks — untracked debug scripts stay out.
      const addUCode = await runStep('git', ['add', '-u'], 'git add -u (all tracked changes)', req);
      if (addUCode !== 0) { finish({ ok: false, error: `git add -u exited ${addUCode}` }); return; }
      // Also pick up any newly uploaded images (untracked new files in public/images/)
      const addCode = await runStep('git', ['add', 'public/images/'], 'git add new images', req);
      if (addCode !== 0) {
        finish({ ok: false, error: `git add exited ${addCode}` });
        return;
      }

      // Check if there's actually anything to commit
      const diffCode = await runStep('git', ['diff', '--cached', '--quiet'], 'Check for changes', req);
      if (diffCode === 0) {
        // Nothing staged — still push in case prior commits weren't pushed
        send('log', { text: '\n(No new changes — pushing existing commits)\n' });
      } else {
        const commitCode = await runStep(
          'git',
          ['commit', '-m', '"chore: deploy via admin portal"'],
          'git commit',
          req,
        );
        if (commitCode !== 0) {
          finish({ ok: false, error: `git commit exited ${commitCode}` });
          return;
        }
      }

      // --autostash handles any dirty working tree files (e.g. .next build artifacts)
      const pullCode = await runStep('git', ['pull', '--rebase', '--autostash', 'origin', 'main'], 'git pull --rebase origin main', req);
      if (pullCode !== 0) {
        finish({ ok: false, error: `git pull --rebase failed (exit ${pullCode}) — resolve conflicts and retry` });
        return;
      }

      const pushCode = await runStep('git', ['push', 'origin', 'main'], 'git push origin main', req);
      finish({
        ok: pushCode === 0,
        note: pushCode === 0 ? 'Vercel will deploy from GitHub — check https://vercel.com/jcai3299-8698s-projects/prompt-gallery and https://gptprompt.asia' : undefined,
      });
      return;
    }

    // ── GET /images/:file ──
    if (path_.startsWith('/images/') && req.method === 'GET') {
      const file     = decodeURIComponent(path_.slice('/images/'.length));
      const filepath = path.join(IMAGES_DIR, file);

      if (!filepath.startsWith(IMAGES_DIR)) { res.writeHead(403); res.end(); return; }

      try {
        const s    = await stat(filepath);
        const ext  = path.extname(filepath).toLowerCase();
        const mime = EXT_MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type':   mime,
          'Content-Length': s.size,
          'Cache-Control':  'public, max-age=86400',
        });
        createReadStream(filepath).pipe(res);
      } catch {
        res.writeHead(404); res.end('Not found');
      }
      return;
    }

    res.writeHead(404); res.end('Not found');

  } catch (err) {
    console.error('[admin] Error:', err);
    if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[admin] Port ${PORT} is already in use.`);
    console.error(`[admin] Run: lsof -ti :${PORT} | xargs kill -9\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  PromptCanvas 图社 — Admin             ║');
  console.log(`║  http://localhost:${PORT}                 ║`);
  console.log('║                                        ║');
  console.log('║  ⌘S / Ctrl+S  →  Save                 ║');
  console.log('║  Ctrl+C       →  Stop server           ║');
  console.log('╚════════════════════════════════════════╝\n');
});
