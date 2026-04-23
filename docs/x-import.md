# Importing Image Prompts From X

Use the official X API instead of scraping the X search page HTML. The search UI is brittle, often requires login, and can conflict with platform rules. The API gives us post text, author attribution, media URLs, and public metrics in one structured response.

## 1. Create A Candidate List

Create an X developer app, copy its bearer token, then run a dry import:

```bash
X_BEARER_TOKEN=... npm run import:x -- \
  --from-url "https://x.com/search?q=chatgpt%20image%20prompt&src=typed_query" \
  --limit 100 \
  --min-likes 25
```

This does not change the gallery. It writes ranked candidates to `tmp/x-candidates.json` so you can review quality, attribution, and source links first.

## 2. Merge Approved Results

When the candidates look good, run with `--write`:

```bash
X_BEARER_TOKEN=... npm run import:x -- \
  --from-url "https://x.com/search?q=chatgpt%20image%20prompt&src=typed_query" \
  --limit 100 \
  --min-likes 50 \
  --write
```

The importer merges new posts into `src/data/prompts.json`, skips duplicate post IDs, downloads images into `public/images/`, and keeps `sourceUrl` so each card links back to the original post.

## Useful Filters

```bash
# English-only, stronger engagement threshold
X_BEARER_TOKEN=... npm run import:x -- --query "chatgpt image prompt has:images -is:retweet lang:en" --min-likes 100

# Use the full archive endpoint if your X API access supports it
X_BEARER_TOKEN=... npm run import:x -- --query "gpt image prompt has:images -is:retweet" --endpoint all --limit 300

# Keep remote image URLs instead of downloading local copies
X_BEARER_TOKEN=... npm run import:x -- --query "chatgpt image prompt" --write --no-download
```

## Notes

The default importer appends `has:images -is:retweet` to search queries unless those operators are already present. Recent search only covers the last 7 days; use `--endpoint all` only if your API plan supports full-archive search.

For a public website, keep attribution visible and be selective about reuse. The importer preserves the original `sourceUrl`, but you should still curate posts and only republish images/prompts when you have permission or a clear reuse basis.
