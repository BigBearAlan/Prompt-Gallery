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

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(__dirname, '..');
const PROMPTS_FILE = path.join(ROOT, 'src', 'data', 'prompts.json');
const IMAGES_DIR   = path.join(ROOT, 'public', 'images');
const HTML_FILE    = path.join(__dirname, 'admin.html');
const PORT         = 3001;

// ── helpers ──────────────────────────────────────────────────────────────────

function getBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || 'null')); }
      catch { resolve(null); }
    });
    req.on('error', reject);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp',
  '.gif': 'image/gif',  '.html': 'text/html; charset=utf-8',
};

// ── server ────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url  = new URL(req.url, `http://localhost:${PORT}`);
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
      res.end(raw); // send as-is, already JSON
      return;
    }

    // ── PUT /api/prompts  (full save) ──
    if (path_ === '/api/prompts' && req.method === 'PUT') {
      const prompts = await getBody(req);
      if (!Array.isArray(prompts)) { json(res, { error: 'Expected array' }, 400); return; }
      await writeFile(PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf-8');
      console.log(`[admin] Saved ${prompts.length} entries → prompts.json`);
      json(res, { ok: true, count: prompts.length });
      return;
    }

    // ── GET /api/deploy  (SSE stream of build + deploy) ──
    if (path_ === '/api/deploy' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const send = (event, data) => {
        if (!res.writableEnded)
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const runStep = (cmd, args, label) => new Promise(resolve => {
        send('log', { text: `\n▶ ${label}\n` });
        const child = spawn(cmd, args, { cwd: ROOT, shell: true });
        child.stdout.on('data', d => send('log', { text: d.toString() }));
        child.stderr.on('data', d => send('log', { text: d.toString() }));
        child.on('close', code => resolve(code));
        req.on('close', () => child.kill());
      });

      const buildCode  = await runStep('npm', ['run', 'build'], 'npm run build');
      if (buildCode !== 0) {
        send('done', { ok: false, error: `Build exited ${buildCode}` });
        res.end(); return;
      }

      const deployCode = await runStep(
        'npx',
        ['wrangler', 'pages', 'deploy', 'out', '--project-name', 'prompt-gallery', '--commit-dirty=true'],
        'wrangler pages deploy'
      );

      send('done', { ok: deployCode === 0 });
      res.end();
      return;
    }

    // ── GET /images/:file ──
    if (path_.startsWith('/images/') && req.method === 'GET') {
      const file     = decodeURIComponent(path_.slice('/images/'.length));
      const filepath = path.join(IMAGES_DIR, file);

      // Prevent directory traversal
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
