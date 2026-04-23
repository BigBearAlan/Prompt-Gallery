# PromptCanvas 图社

A curated gallery of 880+ AI image generation prompts, browsable by category, language, and popularity. Built with Next.js 15 and deployed as a static site.

**Live site →** [prompt-gallery-916.pages.dev](https://prompt-gallery-916.pages.dev)

![PromptCanvas screenshot](public/images/og-preview.jpg)

---

## Features

- **880+ prompts** collected from GPT Image 2, Midjourney, and other AI image tools
- **11 categories** — Manga, Poster, UI, Infographic, Photography, Portrait, Illustration, Advertising, Game, Logo, Other
- **3 languages** — Chinese (481), English (351), Japanese (50)
- Browse, filter by category/language, and sort by likes or views
- Click any card to open the full prompt — edit it inline, then copy to clipboard
- Randomized order on every page load
- Fully static — no server, no database

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, `output: 'export'`) |
| Styling | Tailwind CSS v3 |
| Language | TypeScript |
| Deployment | Cloudflare Pages |
| Admin tool | Standalone Node.js server (no framework) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build static export
npm run build

# Launch the local admin panel (port 3001)
npm run admin
```

---

## Project Structure

```
src/
  app/          Next.js App Router pages
  components/   React components (Gallery, PromptCard, PromptModal, …)
  data/         prompts.json — the full dataset
  lib/          Shared types and utilities

scripts/
  admin.mjs           Local admin server (edit, delete, deploy)
  admin.html          Admin UI (vanilla JS SPA)
  cleanup-prompts.mjs Deduplicate and reclassify prompts.json
  fetch-youmind-api.mjs Scraper used to collect the dataset

public/
  images/       Downloaded prompt output images
```

---

## Admin Panel

A local-only management tool for curating the dataset without touching code.

```bash
npm run admin
# → http://localhost:3001
```

**Features:**
- Masonry grid matching the public site
- Edit title, category, author, and prompt text per entry
- Delete entries with confirmation
- ⌘S / Ctrl+S to save changes to `prompts.json`
- Deploy button — runs `npm run build` then pushes to Cloudflare Pages, with live log streaming

---

## Dataset

Prompts were collected from [YouMind](https://youmind.com/zh-CN/gpt-image-2-prompts) via their API and cleaned with `scripts/cleanup-prompts.mjs`, which:

1. Removes entries with empty prompt text
2. Deduplicates entries that share the same output image
3. Removes near-duplicate prompts (>85% word overlap)
4. Reclassifies categories using keyword rules (CJK-aware)

---

## Deployment

The site is a fully static export deployed to Cloudflare Pages:

```bash
npm run build
npx wrangler pages deploy out --project-name prompt-gallery --commit-dirty=true
```

---

## License

MIT
