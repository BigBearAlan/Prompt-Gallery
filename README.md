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

## License

MIT
