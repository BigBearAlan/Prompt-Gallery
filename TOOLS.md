# PromptCanvas 图社 — Tools Reference

A quick reference for every tool in this project.

- **Admin Panel**: Local web UI for browsing, editing, saving, and deploying prompt entries. 检查修改作业。
- **Fetch Specific Tweets**: Imports one or more X/Twitter posts by URL and adds them to the gallery.
- **YouMind API Fetch**: Bulk imports GPT Image 2 prompts from YouMind’s API.
- **YouMind Scraper**: Bulk imports prompts from YouMind using a Playwright browser scraper.
- **X Search API Import**: Searches X via the official API and imports matching prompt tweets.
- **OpenNana Import**: Pulls prompt entries from OpenNana’s public prompt gallery API.
- **Data Sync**: Merges prompt data from the configured GitHub source repositories.
- **Curation Tool**: Lets you hide, retitle, recategorize, and tag entries from the command line.
- **Cleanup Script**: Removes bad data, deduplicates entries, and reclassifies categories.
- **Gemma Prompt Cleanup**: Uses a local Ollama text model to remove wrapper text from imported prompts and blank obvious non-prompts.
- **Local Dev Server**: Runs the Next.js app locally for UI preview and development.


---

## 1. Admin Panel (Management System)

**What it is:** A local web UI for browsing, editing, and managing all prompt entries. The main day-to-day tool.

**Run:**
```bash
npm run admin
# then open http://localhost:3001
```

**What you can do:**
- Browse and search all 891+ entries in a grid view
- Click any card to edit its title, prompt text, category, and author
- Filter by category or language
- Upload a new image and add a brand new entry manually (click **新增**)
- Delete entries
- **Save** all edits (⌘S / Ctrl+S) — writes directly to `src/data/prompts.json`
- **Deploy to Vercel** — runs `npm run build`, commits prompt/image changes, pushes `main`, and lets Vercel publish production

---

## 2. Fetch Specific Tweets

**What it is:** Fetches one or more X/Twitter posts by URL, downloads their images, and appends them to the gallery. No API key needed.

**Run:**
```bash
node scripts/fetch-tweets.mjs
```

**How to use:** Edit the `TWEET_URLS` array at the top of `scripts/fetch-tweets.mjs`, then run the script. Each tweet's images are saved to `public/images/` and a new entry is appended to `src/data/prompts.json`.

This importer now uses Gemma to:
- clean wrapper chatter out of the prompt text
- generate a better card title from the downloaded image
- choose a gallery category from the image result

After running, review the new entries in the Admin Panel and fix any edge cases where the post still needs manual cleanup.

---

## 3. Bulk Fetch from YouMind API

**What it is:** Pulls all GPT Image 2 prompts from YouMind's database in one shot — the original source of the 882-entry dataset.

**Run:**
```bash
node scripts/fetch-youmind-api.mjs
```

Downloads images in parallel and appends only new entries (deduplicates by tweet ID). Use this periodically to pull freshly-indexed content from YouMind.

---

## 4. Bulk Fetch from YouMind (Browser Scraper)

**What it is:** An alternative to the API fetcher that uses a real Chromium browser via Playwright. Slower but more reliable if the API rate-limits you.

**Prerequisites (one-time):**
```bash
npx playwright install chromium
```

**Run:**
```bash
node scripts/scrape-youmind.mjs
```

---

## 5. Import from X Search API

**What it is:** Searches X/Twitter for new AI image prompt tweets using the official X API and imports them.

**Requires:** An X Developer bearer token (`X_BEARER_TOKEN`).

**Run (dry run — preview only):**
```bash
X_BEARER_TOKEN=your_token npm run import:x -- --from-url "https://x.com/search?q=gpt+image+prompt&src=typed_query"
```

**Run (write to gallery):**
```bash
X_BEARER_TOKEN=your_token npm run import:x -- --from-url "https://x.com/search?q=gpt+image+prompt&src=typed_query" --write
```

---

## 6. Import from OpenNana

**What it is:** Fetches prompt entries from OpenNana’s public gallery API, including image URLs, prompt text, source tweet links, and metadata.

**Run (dry run):**
```bash
npm run import:opennana -- --from-url "https://opennana.com/awesome-prompt-gallery?model=ChatGPT" --limit 20
```

**Run (write to gallery):**
```bash
npm run import:opennana -- --from-url "https://opennana.com/awesome-prompt-gallery?model=ChatGPT" --limit 20 --write
```

By default, dry runs write candidate data to `tmp/opennana-candidates.json`.

---

## 7. Data Sync (GitHub Sources)

**What it is:** Fetches and merges prompt data from two open-source GitHub repositories (`EvoLinkAI/awesome-gpt-image-2-prompts` and `YouMind-OpenLab/awesome-gpt-image-2`) and rebuilds `prompts.json`.

**Run:**
```bash
npm run sync
```

---

## 8. Curation Tool

**What it is:** A command-line tool to hide, re-categorise, re-title, and tag-manage entries without editing `prompts.json` by hand. Changes are stored in `src/data/curation.json` as lightweight overrides.

**Run:**
```bash
# Audit — writes a report of duplicates and category issues to docs/gallery-audit.md
npm run curate:audit

# Re-run auto-classification on every entry
npm run curate:reclassify

# Find an entry by keyword
npm run curate -- search "paella"

# Hide an entry
npm run curate -- hide 2046530758190440928 "prompt says see thread"

# Override a category
npm run curate -- category 2046272578705068476 illustration

# Override a title
npm run curate -- title 2046272578705068476 "大闹天宫 — 中国连环画风格"

# Add / remove a tag
npm run curate -- tag:add 2046272578705068476 featured
npm run curate -- tag:remove 2046272578705068476 other

# List all current curation overrides
npm run curate -- list

# Apply curation overrides to prompts.json (without re-fetching)
npm run curate -- apply
```

---

## 9. Cleanup Script

**What it is:** A one-shot data hygiene script. Removes empty prompts, deduplicates entries that share the same thumbnail image (keeps highest-engagement), deduplicates near-identical prompt text (>85% word overlap), and re-classifies categories using CJK-aware rules.

**Run:**
```bash
npm run cleanup
```

Run this after a large bulk import to tidy up the dataset before deploying.

---

## 10. Gemma Prompt Cleanup

**What it is:** A local Gemma-powered cleanup step that strips wrapper text from imported social posts and blanks entries that do not actually contain a usable prompt.

**Default behavior:** online import scripts clean prompt text automatically before writing `tmp/review.json`, `tmp/x-candidates.json`, or `src/data/prompts.json`. If Ollama fails, the import keeps the original extracted text and continues.

**Run on pending entries only:**
```bash
npm run prompt:clean
```

**Run tests:**
```bash
npm run test:prompt-clean
```

**Useful env vars:**
```bash
PROMPT_CLEANUP_MODEL=gemma4:e2b
OLLAMA_HOST=http://localhost:11434
PROMPT_CLEANUP_TIMEOUT_MS=60000
```

---

## 11. Local Dev Server

**What it is:** Standard Next.js development server with hot reload. Use this to preview UI changes before deploying.

**Run:**
```bash
npm run dev
# then open http://localhost:3000
```

---

## Typical Workflows

### Add a few specific tweets
1. Add their URLs to `TWEET_URLS` in `scripts/fetch-tweets.mjs`
2. `node scripts/fetch-tweets.mjs`
3. Open Admin Panel (`npm run admin`), fix any prompts that say "see comment"
4. Save (⌘S), then Deploy → Vercel

### Bulk refresh from YouMind
1. `node scripts/fetch-youmind-api.mjs`
2. `npm run cleanup` (remove dupes, fix categories)
3. `npm run admin` → review → Save → Deploy

### Fix a wrong category or title
```bash
npm run curate -- category <id> <category>
npm run curate -- title <id> "New Title"
npm run curate -- apply
# then deploy via admin panel
```

### Find entries with bad prompts
```bash
node -e "
const d = require('./src/data/prompts.json');
d.filter(e => e.prompt.length < 30 || e.prompt.toLowerCase().includes('see comment'))
 .forEach(e => console.log(e.id, e.sourceUrl, JSON.stringify(e.prompt.slice(0,80))));
"
```
