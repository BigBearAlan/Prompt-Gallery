#!/usr/bin/env node
/**
 * Import local images + prompts into the Prompt Gallery.
 *
 * Reads paired files from:
 *   - generated_images/HASH.png   ← the image
 *   - outputs/Done/HASH.md        ← ratio + prompt text
 *
 * Usage:
 *   node scripts/import-local-images.mjs <images-dir> <done-dir> [--dry-run]
 *
 * Example:
 *   node scripts/import-local-images.mjs \
 *     "/Users/.../Pinterest Automation/generated_images" \
 *     "/Users/.../Pinterest Automation/outputs/Done"
 *
 * Adds entries with pending:true so you can review them in the admin portal.
 * Source and author link are set to https://pixwo.tech.
 */

import { readdir, readFile, copyFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT         = path.resolve(__dirname, '..');
const PROMPTS_FILE = path.join(ROOT, 'src', 'data', 'prompts.json');
const IMAGES_DIR   = path.join(ROOT, 'public', 'images');
const SITE_URL     = 'https://pixwo.tech';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [imagesDir, doneDir] = args;

if (!imagesDir || !doneDir) {
  console.log('Usage: node scripts/import-local-images.mjs <images-dir> <done-dir> [--dry-run]');
  console.log('\nExample:');
  console.log("  node scripts/import-local-images.mjs \\");
  console.log('    "/path/to/generated_images" \\');
  console.log('    "/path/to/outputs/Done"');
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function parseMd(content) {
  // Ratio line:  "Image ratio: 9:16"
  const ratioMatch = content.match(/image\s+ratio:\s*(\d+)\s*:\s*(\d+)/i);
  const rw = ratioMatch ? parseInt(ratioMatch[1]) : 1;
  const rh = ratioMatch ? parseInt(ratioMatch[2]) : 1;
  // thumbnailAspect = height / width
  const thumbnailAspect = rw > 0 ? parseFloat((rh / rw).toFixed(4)) : 1.33;

  // Prompt block: everything after "## Prompt output"
  const promptMatch = content.match(/##\s*prompt\s+output\s*\n+([\s\S]+?)(?:\n##|$)/i);
  const prompt = promptMatch ? promptMatch[1].trim() : content.trim();

  return { thumbnailAspect, prompt };
}

function titleFromPrompt(prompt, max = 80) {
  // First sentence or first line, whichever is shorter
  const first = (prompt.split(/[.\n]/)[0] || prompt).trim();
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}

function detectLang(text) {
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  return 'en';
}

function detectCategory(prompt) {
  const t = prompt.toLowerCase();
  if (/\b(manga|anime|comic|webtoon|chibi)\b/.test(t))            return 'manga';
  if (/\b(portrait|face|headshot|selfie|person)\b/.test(t))       return 'portrait';
  if (/\b(photograph|photo|camera|cctv|cinematic|film)\b/.test(t)) return 'photography';
  if (/\b(poster|advertisement|ad |commercial|billboard)\b/.test(t)) return 'poster';
  if (/\b(ui|ux|interface|app|website|dashboard|wireframe)\b/.test(t)) return 'ui';
  if (/\b(illustration|drawing|sketch|painting|watercolor)\b/.test(t)) return 'illustration';
  if (/\b(game|gaming|pixel|sprite|rpg|fantasy map)\b/.test(t))   return 'game';
  if (/\b(logo|icon|brand|badge|emblem)\b/.test(t))               return 'logo';
  if (/\b(infographic|chart|diagram|data|timeline)\b/.test(t))    return 'infographic';
  return 'other';
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nLocal Image Importer');
  console.log('─'.repeat(52));
  console.log(`Images : ${imagesDir}`);
  console.log(`Done   : ${doneDir}`);
  console.log(`Mode   : ${DRY_RUN ? 'dry-run (no files written)' : 'live'}`);
  console.log('─'.repeat(52) + '\n');

  // Load existing prompts to check for duplicates
  const existing = JSON.parse(await readFile(PROMPTS_FILE, 'utf-8'));
  const existingIds = new Set(existing.map(e => e.id));

  // Discover .md files in Done dir
  const mdFiles = (await readdir(doneDir))
    .filter(f => f.endsWith('.md'));

  if (mdFiles.length === 0) {
    console.log('No .md files found in Done folder.');
    process.exit(0);
  }

  console.log(`Found ${mdFiles.length} item(s) in Done folder\n`);

  const toAdd = [];
  let skipped = 0;

  for (const mdFile of mdFiles) {
    const hash = path.basename(mdFile, '.md');

    // Find the matching image (try common extensions)
    let imgSrcPath = null;
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.gif']) {
      const candidate = path.join(imagesDir, hash + ext);
      if (existsSync(candidate)) { imgSrcPath = candidate; break; }
    }

    if (!imgSrcPath) {
      console.log(`  SKIP  ${hash} — no matching image file`);
      skipped++;
      continue;
    }

    if (existingIds.has(hash)) {
      console.log(`  SKIP  ${hash} — already in prompts.json`);
      skipped++;
      continue;
    }

    // Parse markdown
    const mdContent = await readFile(path.join(doneDir, mdFile), 'utf-8');
    const { thumbnailAspect, prompt } = parseMd(mdContent);

    const ext      = path.extname(imgSrcPath);
    const imgName  = `${hash}${ext}`;
    const imgDest  = path.join(IMAGES_DIR, imgName);
    const webPath  = `/images/${imgName}`;

    // Copy image to public/images/
    if (!DRY_RUN) {
      await copyFile(imgSrcPath, imgDest);
    }

    const lang     = detectLang(prompt);
    const category = detectCategory(prompt);
    const title    = titleFromPrompt(prompt);

    const entry = {
      id:              hash,
      title,
      thumbnail:       webPath,
      thumbnailAspect,
      author:          'PixWo',
      authorUrl:       SITE_URL,
      tags:            [lang, category],
      category,
      lang,
      stats:           { likes: 0, retweets: 0, views: 0 },
      createdAt:       new Date().toISOString(),
      prompt,
      outputImages:    [webPath],
      sourceUrl:       SITE_URL,
      pending:         true,
      _srcImg:         imgSrcPath,
      _srcMd:          path.join(doneDir, mdFile),
    };

    toAdd.push(entry);
    console.log(`  ADD   ${hash}  [${category}]  ${title.slice(0, 50)}`);
  }

  console.log(`\n─`.repeat(52 / 2));

  if (toAdd.length === 0) {
    console.log(`Nothing new to add (${skipped} skipped).`);
    process.exit(0);
  }

  if (!DRY_RUN) {
    // Strip internal tracking fields before writing
    const clean = toAdd.map(({ _srcImg, _srcMd, ...e }) => e);
    await writeFile(
      PROMPTS_FILE,
      JSON.stringify([...existing, ...clean], null, 2),
      'utf-8',
    );
    console.log(`\nAdded ${toAdd.length} entry(s) to prompts.json (pending review)`);
    console.log(`Skipped: ${skipped}`);

    // Delete source files now that prompts.json is safely written
    console.log('\nCleaning up source files…');
    for (const entry of toAdd) {
      await unlink(entry._srcImg).catch(() => {});
      await unlink(entry._srcMd).catch(() => {});
      console.log(`  DELETED  ${path.basename(entry._srcImg)}`);
    }

    console.log(`\nOpen the admin portal and check the 待发布 tab to review.\n`);
  } else {
    console.log(`\nDry-run: would add ${toAdd.length}, skip ${skipped}. Run without --dry-run to apply.\n`);
  }
})().catch(err => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
