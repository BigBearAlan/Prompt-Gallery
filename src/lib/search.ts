import type { ImageSearchDoc, PromptEntry, SortBy } from './types';

export type SearchMode = 'image' | 'author' | 'title';

export interface ParsedSearchQuery {
  raw: string;
  mode: SearchMode;
  term: string;
  normalizedTerm: string;
  isCjk: boolean;
  tokens: string[];
}

export function normalizeSearchText(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([a-z]+)\s*[:：]\s*(.+)$/i);

  let mode: SearchMode = 'image';
  let term = trimmed;
  if (match) {
    const prefix = match[1].toLowerCase();
    if (prefix === 'author' || prefix === 'title') {
      mode = prefix;
      term = match[2].trim();
    }
  }

  const normalizedTerm = normalizeSearchText(term);
  const isCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalizedTerm);
  const tokens = isCjk
    ? []
    : normalizedTerm.split(' ').filter((token) => token.length > 1);

  return { raw, mode, term, normalizedTerm, isCjk, tokens };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenMatchStrength(haystackRaw: string, query: ParsedSearchQuery): number {
  const haystack = normalizeSearchText(haystackRaw);
  if (!haystack || !query.normalizedTerm) return 0;
  if (haystack === query.normalizedTerm) return 1;

  if (query.isCjk) {
    if (!haystack.includes(query.normalizedTerm)) return 0;
    // Score by specificity: shorter haystack relative to term = more focused match
    const ratio = query.normalizedTerm.length / haystack.length;
    if (ratio >= 0.85) return 0.95; // near-exact
    if (ratio >= 0.50) return 0.80; // term is bulk of haystack
    if (ratio >= 0.20) return 0.60; // mention in medium text
    return 0.40;                    // brief mention in long text
  }

  const boundary = new RegExp(`(^|\\s)${escapeRegExp(query.normalizedTerm)}(\\s|$)`, 'i');
  if (boundary.test(haystack)) return 0.88;
  if (haystack.includes(query.normalizedTerm) && haystack.length <= query.normalizedTerm.length + 4) return 0.7;

  if (query.tokens.length === 0) return 0;
  const matchedTokens = query.tokens.filter((token) => {
    const tokenBoundary = new RegExp(`(^|\\s)${escapeRegExp(token)}(\\s|$)`, 'i');
    return tokenBoundary.test(haystack);
  }).length;

  if (matchedTokens === query.tokens.length) return 0.58;
  if (matchedTokens > 0) return 0.2 + (matchedTokens / query.tokens.length) * 0.2;
  return 0;
}

function maxStrength(candidates: string[], query: ParsedSearchQuery): number {
  let best = 0;
  for (const candidate of candidates) {
    const score = tokenMatchStrength(candidate, query);
    if (score > best) best = score;
  }
  return best;
}

function secondarySortValue(entry: PromptEntry, sortBy: SortBy): number {
  if (sortBy === 'likes') return entry.stats.likes;
  if (sortBy === 'views') return entry.stats.views;
  const timestamp = Date.parse(entry.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareBySecondarySort(a: PromptEntry, b: PromptEntry, sortBy: SortBy): number {
  return secondarySortValue(b, sortBy) - secondarySortValue(a, sortBy);
}

export function scorePrefixSearch(entry: PromptEntry, query: ParsedSearchQuery): number {
  const source = query.mode === 'author' ? entry.author : entry.title;
  const sourceNorm = normalizeSearchText(source);
  if (!sourceNorm || !query.normalizedTerm) return 0;
  if (sourceNorm === query.normalizedTerm) return 100;
  if (sourceNorm.includes(query.normalizedTerm)) {
    return query.mode === 'author' ? 96 : 90;
  }
  const strength = tokenMatchStrength(source, query);
  if (strength === 0) return 0;
  return Math.round(strength * 100);
}

/**
 * Score an entry by directly searching its title, prompt text, and author.
 * No search index needed — used for instant results while the image index loads,
 * and as a supplementary signal when the index is available.
 */
export function scorePromptText(entry: PromptEntry, query: ParsedSearchQuery): number {
  if (!query.normalizedTerm) return 0;
  const titleStrength  = tokenMatchStrength(entry.title  || '', query);
  const promptStrength = tokenMatchStrength(entry.prompt || '', query);
  const authorStrength = tokenMatchStrength(entry.author || '', query);
  let score = 0;
  score += titleStrength  * 90;
  score += promptStrength * 55;
  score += authorStrength * 35;
  return Math.round(score);
}

export function scoreImageSearch(doc: ImageSearchDoc | undefined, query: ParsedSearchQuery): number {
  if (!doc || !query.normalizedTerm) return 0;

  const keywordCandidates = [...doc.keywords.zh, ...doc.keywords.en, ...doc.keywords.ja];
  const keywordScore = maxStrength(keywordCandidates, query);
  const objectScore = maxStrength(doc.objects, query);
  const visibleTextScore = maxStrength(doc.visibleText, query);
  const captionScore = maxStrength([doc.caption.zh, doc.caption.en, doc.caption.ja], query);
  const searchTextScore = query.isCjk ? 0 : tokenMatchStrength(doc.searchText, query);

  let score = 0;
  score += keywordScore * 120;
  score += objectScore * 110;
  score += visibleTextScore * 50; // OCR text — lower weight to avoid spurious brand/label matches
  score += captionScore * 70;
  score += searchTextScore * 35;

  if (keywordScore > 0 && (objectScore > 0 || visibleTextScore > 0)) score += 18;
  if (visibleTextScore > 0 && captionScore > 0) score += 10;

  return Math.round(score);
}
