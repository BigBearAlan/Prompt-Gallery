# Gallery Management

The gallery is a static site, so the easiest admin workflow is local curation:

1. Sync or import new prompts.
2. Run an audit to find duplicate prompts and category mismatches.
3. Save curation decisions in `src/data/curation.json`.
4. Apply/sync, build, and redeploy.

## Daily Commands

```bash
npm run curate:audit
```

This writes `docs/gallery-audit.md` with:

- Exact duplicate prompt groups.
- Duplicate source IDs that need stable per-card IDs.
- Category counts.
- Suggested category fixes.
- Ready-to-run commands for each suggested fix.

Search for a prompt when you need its ID:

```bash
npm run curate -- search "travel guide"
```

Hide a duplicate:

```bash
npm run curate -- hide 2046378199681257920 "duplicate of 2046231542817497392"
```

Fix a category:

```bash
npm run curate -- category 2046231542817497392 infographic
```

Re-detect categories for every current entry after changing taxonomy rules:

```bash
npm run curate -- reclassify
```

Let the local heuristic choose a category for one item:

```bash
npm run curate -- category 2046231542817497392 auto
```

Hide all exact duplicate prompt groups automatically, keeping the highest-liked item:

```bash
npm run curate -- dedupe
```

Apply curation to the current generated data without fetching new prompts:

```bash
npm run curate -- apply
```

This also fixes repeated card IDs by adding stable suffixes, which makes filtering,
React rendering, and future curation commands unambiguous.

## Category Taxonomy

The current top-level categories are:

- `manga`: manga/comic pages, strips, four-panel pages, webtoon-like layouts.
- `advertising`: ads, product campaigns, promo banners, flyers, e-commerce creatives.
- `game`: game screenshots, HUDs, cards, gacha screens, RPG/FPS/game assets.
- `portrait`: people/character portraits and selfie-style compositions.
- `photography`: realistic photo/camera/film-style outputs.
- `poster`: movie posters, covers, thumbnails, key visuals, editorial poster layouts.
- `illustration`: illustrated scenes, stickers, icons, character/reference sheets.
- `ui`: interfaces, dashboards, app screens, social profiles, mockups.
- `infographic`: diagrams, explainers, maps, timelines, dense information graphics.
- `logo`: logos and brand identity boards.
- `other`: items that do not confidently match the above.

## Redeploy Flow

After curation, use the same deployment flow as before:

```bash
node scripts/sync-data.mjs
npm run build
npx wrangler pages deploy out --project-name prompt-gallery --commit-dirty=true
```

`scripts/sync-data.mjs` now reads `src/data/curation.json`, so hidden prompts and category overrides survive future syncs.
