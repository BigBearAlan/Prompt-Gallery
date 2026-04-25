/**
 * PromptCanvas Admin Server
 * Run:  node scripts/admin.mjs
 * Open: http://localhost:3001
 */

import { createServer } from 'http';
import { readFile, writeFile, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(__dirname, '..');
const PROMPTS_FILE = path.join(ROOT, 'src', 'data', 'prompts.json');
const IMAGES_DIR   = path.join(ROOT, 'public', 'images');
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

      const buildCode = await runStep('npm', ['run', 'build'], 'npm run build', req);
      if (buildCode !== 0) {
        finish({ ok: false, error: `Build exited ${buildCode}` });
        return;
      }

      // Stage curated data + any newly uploaded images. Vercel builds from GitHub.
      const addCode = await runStep('git', ['add', 'src/data/prompts.json', 'src/data/curation.json', 'public/images/'], 'git add prompt data + images', req);
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
          ['commit', '-m', '"chore: update prompts data via admin"'],
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
