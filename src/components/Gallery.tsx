'use client';

import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import type { ImageQualityData, PromptEntry, SearchIndexFile } from '@/lib/types';
import { useLocale } from '@/lib/i18n';
import { getPromptQualityScore, randomizedQualityRankValue } from '@/lib/ranking';
import {
  compareBySecondarySort,
  parseSearchQuery,
  scoreImageSearch,
  scorePrefixSearch,
  scorePromptText,
} from '@/lib/search';
import PromptCard from './PromptCard';
import PromptModal from './PromptModal';

const PAGE_SIZE = 48;
const SHUFFLE_SEED = 0.5;

interface Props {
  entries: PromptEntry[];
  imageQuality: ImageQualityData;
  chromeCompact?: boolean; // eslint-disable-line @typescript-eslint/no-unused-vars
}

interface MasonryCard {
  entry: PromptEntry;
  index: number;
}

function columnCountForWidth(width: number) {
  if (width < 360) return 1;
  if (width < 640) return 2;
  if (width < 1024) return 3;
  if (width < 1440) return 4;
  return 5;
}

function safeAspect(entry: PromptEntry) {
  return Number.isFinite(entry.thumbnailAspect) && entry.thumbnailAspect > 0
    ? entry.thumbnailAspect
    : 1.25;
}

function useMasonryColumns(displayed: PromptEntry[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateColumnCount = () => {
      const next = columnCountForWidth(node.clientWidth || window.innerWidth);
      setColumnCount((current) => (current === next ? current : next));
    };

    updateColumnCount();

    const ResizeObserverCtor = window.ResizeObserver;
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(updateColumnCount);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  const columns = useMemo(() => {
    const next = Array.from({ length: columnCount }, () => ({
      height: 0,
      items: [] as MasonryCard[],
    }));

    displayed.forEach((entry, index) => {
      let targetIndex = 0;
      for (let i = 1; i < next.length; i += 1) {
        if (next[i].height < next[targetIndex].height) targetIndex = i;
      }

      next[targetIndex].items.push({ entry, index });
      next[targetIndex].height += safeAspect(entry) + 0.08;
    });

    return next.map((column) => column.items);
  }, [columnCount, displayed]);

  return { columnCount, columns, containerRef };
}

export default function Gallery({ entries, imageQuality }: Props) {
  const { tx } = useLocale();
  const [search] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category] = useState('all');
  const [lang] = useState('all');
  const sortBy = 'recent' as const;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [searchIndex, setSearchIndex] = useState<SearchIndexFile | null>(null);
  const [searchIndexStatus, setSearchIndexStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [shuffleSeed, setShuffleSeed] = useState(SHUFFLE_SEED);

  useEffect(() => {
    setShuffleSeed(Math.random());
  }, []);

  const qualityBoosted = useMemo(() => {
    return [...entries]
      .map((entry) => ({
        entry,
        rankValue: randomizedQualityRankValue(entry, shuffleSeed, imageQuality),
      }))
      .sort((a, b) => b.rankValue - a.rankValue)
      .map((item) => item.entry);
  }, [entries, imageQuality, shuffleSeed]);

  const parsedSearch = useMemo(() => parseSearchQuery(deferredSearch), [deferredSearch]);

  // Track whether a fetch has been started so we never double-fetch or
  // accidentally cancel an in-flight request when dependencies re-render.
  const fetchAttempted = useRef(false);

  useEffect(() => {
    if (!parsedSearch.normalizedTerm || parsedSearch.mode !== 'image') return;
    if (fetchAttempted.current) return;
    fetchAttempted.current = true;

    setSearchIndexStatus('loading');

    fetch('/search-index.json')
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

  const pinScore = (list: PromptEntry[]) => {
    const pinned = list.filter(e => (e.score ?? 0) > 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const normal = list.filter(e => !((e.score ?? 0) > 0));
    return [...pinned, ...normal];
  };

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
            // Require text-side corroboration to suppress OCR noise (e.g. brand names
            // accidentally matching a query word). Image-only matches get a 45% penalty.
            const imgFinal = imgScore > 0
              ? (txtScore > 0 ? imgScore + txtScore * 0.35 : imgScore * 0.45)
              : 0;
            score = imgFinal > 0 ? imgFinal : txtScore * 0.6;
          } else {
            // Index still loading — search title + prompt text immediately
            score = scorePromptText(entry, parsedSearch);
          }

          score += entry.hq ? 30 : 0;
          const qualityScore = getPromptQualityScore(entry, imageQuality);
          if (qualityScore !== null) score += qualityScore * 0.25;
          return { entry, score };
        })
        // Minimum threshold: filters noise/weak partial matches.
        // scorePromptText title-match alone ≈ 79, prompt-match alone ≈ 48 — both pass 38.
        .filter((item) => item.score >= 38)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return compareBySecondarySort(a.entry, b.entry, sortBy);
        });

      result = scored.map((item) => item.entry);
    } else {
      result = qualityBoosted;
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
      return pinScore(result);
    }

    return pinScore(result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, entries, imageQuality, lang, parsedSearch, qualityBoosted, searchIndex, searchIndexStatus, tagFilter]);

  const displayed = useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page]
  );

  const hasMore = displayed.length < filtered.length;

  // Infinite scroll — observe a sentinel element near the bottom of the feed
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMoreRef  = useRef(hasMore);
  useEffect(() => { hasMoreRef.current = hasMore; });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: '400px' }, // preload 400px before the bottom edge
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []); // mount once — hasMoreRef keeps the callback up to date

  const { columnCount, columns, containerRef } = useMasonryColumns(displayed);
  const eagerImageCount = Math.min(displayed.length, Math.max(12, columnCount * 4));

  const handleTagClick = (tag: string) => {
    setTagFilter((prev) => (prev === tag ? '' : tag));
    setPage(1);
  };

  const isZh = tx.langToggle === 'EN'; // zh locale shows 'EN' as the toggle label

  // Compute current month/year for the hero strip
  const heroDate = new Date().toLocaleString(isZh ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <>
      {/* ── Hero strip ── */}
      <div
        className="max-w-[1800px] mx-auto"
        style={{ padding: '28px 20px 8px' }}
      >
        <div
          className="flex items-end justify-between gap-6"
          style={{ borderBottom: '1px solid rgba(26,23,20,0.1)', paddingBottom: 20 }}
        >
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'clamp(22px, 2.8vw, 34px)',
              fontWeight: 400,
              lineHeight: 1.2,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
              maxWidth: 820,
            }}
          >
            {isZh
              ? '一座关于生成影像与提示词的资料库'
              : 'An archive of generative imagery & prompts'}
          </h1>
          <div
            className="hidden sm:block shrink-0 text-right"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              lineHeight: 1.9,
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            {heroDate}<br />
            {entries.length.toLocaleString()} {isZh ? '条作品' : 'ENTRIES'}
          </div>
        </div>
      </div>

      <main className="max-w-[1800px] mx-auto px-2.5 sm:px-4 py-3 sm:py-4">
        {displayed.length === 0 ? (
          <div
            className="text-center py-24 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {tx.noResults}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="masonry-grid"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {columns.map((column, columnIndex) => (
              <div className="masonry-column" key={columnIndex}>
                {column.map(({ entry, index }) => (
                  <PromptCard
                    key={entry.id}
                    entry={entry}
                    loading={index < eagerImageCount ? 'eager' : 'lazy'}
                    onClick={() => setSelected(entry)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Sentinel — IntersectionObserver fires ~400px before this to preload next page */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {!hasMore && displayed.length > 0 && (
          <p className="text-center text-xs pb-10 pt-6" style={{ color: 'var(--text-secondary)' }}>
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
