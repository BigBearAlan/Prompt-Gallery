'use client';

import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, startTransition } from 'react';
import type { PromptEntry, SearchIndexFile, SortBy } from '@/lib/types';
import { withBasePath } from '@/lib/asset-path';
import { useLocale } from '@/lib/i18n';
import {
  compareBySecondarySort,
  parseSearchQuery,
  scoreImageSearch,
  scorePrefixSearch,
  scorePromptText,
} from '@/lib/search';
import PromptCard from './PromptCard';
import PromptModal from './PromptModal';
import SearchFilterBar from './SearchFilterBar';

const PAGE_SIZE = 48;

interface Props {
  entries: PromptEntry[];
}

export default function Gallery({ entries }: Props) {
  const { tx } = useLocale();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState('all');
  const [lang, setLang] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [searchIndex, setSearchIndex] = useState<SearchIndexFile | null>(null);
  const [searchIndexStatus, setSearchIndexStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  // Shuffle once per session (stable across re-renders, new order on page reload)
  const sessionSeed = useRef(Math.random());
  const shuffled = useMemo(() => {
    let seed = sessionSeed.current;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    // Weighted shuffle: HQ entries draw from [0, 0.4), regular from [0, 1).
    // They genuinely mix but HQ tends toward the front without being separated.
    return [...entries]
      .map(e => ({ e, pos: rng() * (e.hq ? 0.4 : 1) }))
      .sort((a, b) => a.pos - b.pos)
      .map(x => x.e);
  }, [entries]);

  const parsedSearch = useMemo(() => parseSearchQuery(deferredSearch), [deferredSearch]);

  // Track whether a fetch has been started so we never double-fetch or
  // accidentally cancel an in-flight request when dependencies re-render.
  const fetchAttempted = useRef(false);

  useEffect(() => {
    if (!parsedSearch.normalizedTerm || parsedSearch.mode !== 'image') return;
    if (fetchAttempted.current) return;
    fetchAttempted.current = true;

    setSearchIndexStatus('loading');

    fetch(withBasePath('/search-index.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: SearchIndexFile) => {
        setSearchIndex(json);
        setSearchIndexStatus('ready');
      })
      .catch(() => {
        fetchAttempted.current = false; // allow retry on next search
        setSearchIndexStatus('error');
      });
  // Only re-run when search mode/term changes — intentionally excludes
  // searchIndex and searchIndexStatus to avoid cancelling an in-flight fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedSearch.mode, parsedSearch.normalizedTerm]);

  const searchInfo = useMemo(() => {
    if (!parsedSearch.normalizedTerm) return '';
    if (parsedSearch.mode === 'author') return tx.searchAuthorHint;
    if (parsedSearch.mode === 'title') return tx.searchTitleHint;
    if (searchIndexStatus === 'error') return tx.searchUnavailable;
    if (searchIndexStatus !== 'ready') return tx.searchLoadingFallback;
    return tx.searchImageHint;
  }, [parsedSearch.mode, parsedSearch.normalizedTerm, searchIndexStatus, tx]);

  const filtered = useMemo(() => {
    let result: PromptEntry[];

    if (parsedSearch.normalizedTerm) {
      const indexReady = searchIndexStatus === 'ready';

      const scored = entries
        .map((entry) => {
          let score = 0;

          if (parsedSearch.mode !== 'image') {
            // author / title — instant, no index needed
            score = scorePrefixSearch(entry, parsedSearch);
          } else if (indexReady) {
            // Image index ready: image-content score (primary) + prompt text (secondary)
            const imgScore = scoreImageSearch(searchIndex?.entries?.[entry.id], parsedSearch);
            const txtScore = scorePromptText(entry, parsedSearch);
            // If the image index found something, blend in text as a tiebreaker;
            // if not, fall back to prompt text alone so we never return 0 for a real match.
            score = imgScore > 0 ? imgScore + txtScore * 0.35 : txtScore * 0.6;
          } else {
            // Index still loading — search title + prompt text immediately
            score = scorePromptText(entry, parsedSearch);
          }

          score += entry.hq ? 30 : 0;
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return compareBySecondarySort(a.entry, b.entry, sortBy);
        });

      result = scored.map((item) => item.entry);
    } else {
      result = shuffled;
    }

    if (category !== 'all') {
      result = result.filter((e) => e.category === category);
    }

    if (lang !== 'all') {
      result = result.filter((e) => e.lang === lang);
    }

    if (tagFilter) {
      result = result.filter((e) => e.tags.includes(tagFilter));
    }

    if (parsedSearch.normalizedTerm) {
      return result;
    }

    // HQ entries get a 1.5× score boost so they surface higher without hard-separating tiers
    if (sortBy === 'likes') return [...result].sort((a, b) =>
      b.stats.likes * (b.hq ? 1.5 : 1) - a.stats.likes * (a.hq ? 1.5 : 1)
    );
    if (sortBy === 'views') return [...result].sort((a, b) =>
      b.stats.views * (b.hq ? 1.5 : 1) - a.stats.views * (a.hq ? 1.5 : 1)
    );
    return result; // 'recent' uses the weighted shuffle above
  }, [category, entries, lang, parsedSearch, searchIndex, searchIndexStatus, shuffled, sortBy, tagFilter]);

  const displayed = useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page]
  );

  const hasMore = displayed.length < filtered.length;

  const handleSearch = useCallback((v: string) => {
    startTransition(() => {
      setSearch(v);
      setPage(1);
    });
  }, []);

  const handleCategory = useCallback((v: string) => {
    setCategory(v);
    setPage(1);
  }, []);

  const handleLang = useCallback((v: string) => {
    setLang(v);
    setPage(1);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setTagFilter((prev) => (prev === tag ? '' : tag));
    setCategory('all');
    setSearch('');
    setPage(1);
  }, []);

  return (
    <>
      <SearchFilterBar
        search={search}
        onSearchChange={handleSearch}
        searchInfo={searchInfo}
        category={category}
        onCategoryChange={handleCategory}
        lang={lang}
        onLangChange={handleLang}
        sortBy={sortBy}
        onSortChange={setSortBy}
        tagFilter={tagFilter}
        onTagFilterClear={() => setTagFilter('')}
        count={filtered.length}
        total={entries.length}
      />

      <main className="max-w-screen-2xl mx-auto px-3 py-4">
        {displayed.length === 0 ? (
          <div
            className="text-center py-24 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {tx.noResults}
          </div>
        ) : (
          <div className="masonry">
            {displayed.map((entry) => (
              <PromptCard
                key={entry.id}
                entry={entry}
                onClick={() => setSelected(entry)}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="text-center mt-8 pb-8">
            <button
              onClick={() => setPage((p) => p + 1)}
              className="px-6 py-2.5 rounded-full text-sm font-medium border transition-colors hover:bg-gray-100"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {tx.loadMore(filtered.length - displayed.length)}
            </button>
          </div>
        )}

        {!hasMore && displayed.length > 0 && (
          <p
            className="text-center text-xs pb-8 pt-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            {tx.showingAll(displayed.length)}
          </p>
        )}
      </main>

      {selected && (() => {
        const idx = filtered.findIndex(e => e.id === selected.id);
        return (
          <PromptModal
            entry={selected}
            onClose={() => setSelected(null)}
            onTagClick={handleTagClick}
            hasPrev={idx > 0}
            hasNext={idx < filtered.length - 1}
            onPrev={() => idx > 0 && setSelected(filtered[idx - 1])}
            onNext={() => idx < filtered.length - 1 && setSelected(filtered[idx + 1])}
          />
        );
      })()}
    </>
  );
}
