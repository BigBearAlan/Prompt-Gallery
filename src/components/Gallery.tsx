'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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

interface Props {
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

export default function Gallery({}: Props) {
  const { tx } = useLocale();

  // ── Data: load chunks progressively from public/data/ ──────────────────
  const [entries, setEntries] = useState<PromptEntry[]>([]);
  const [imageQuality, setImageQuality] = useState<ImageQualityData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [manifest, iq] = await Promise.all([
          fetch('/data/manifest.json').then((r) => r.json()),
          fetch('/data/image-quality.json').then((r) => r.json()),
        ]);
        if (cancelled) return;
        setImageQuality(iq);

        const chunk1: PromptEntry[] = await fetch('/data/chunk-001.json').then((r) => r.json());
        if (cancelled) return;
        setEntries(chunk1);
        setDataLoading(false);

        // Fire remaining chunks in parallel; merge as each arrives
        for (let i = 2; i <= manifest.chunks; i++) {
          const num = String(i).padStart(3, '0');
          fetch(`/data/chunk-${num}.json`)
            .then((r) => r.json())
            .then((chunk: PromptEntry[]) => {
              if (!cancelled) setEntries((prev) => [...prev, ...chunk]);
            })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setDataLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const search = '';

  const [category] = useState('all');
  const [lang]     = useState('all');
  const sortBy = 'recent' as const;

  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<PromptEntry | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [searchIndex, setSearchIndex]           = useState<SearchIndexFile | null>(null);
  const [searchIndexStatus, setSearchIndexStatus] =
    useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [shuffleSeed, setShuffleSeed] = useState(0.5);

  useEffect(() => { setShuffleSeed(Math.random()); }, []);

  // ── Deep links (fix #2) ─────────────────────────────────────────────────
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Read ?p= from URL on mount; close modal on browser back
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('p');
    if (id) setPendingId(id);

    const onPop = () => {
      const newId = new URLSearchParams(window.location.search).get('p');
      if (!newId) setSelected(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Resolve pending deep link once the matching entry has loaded
  useEffect(() => {
    if (!pendingId || !entries.length) return;
    const entry = entries.find((e) => e.id === pendingId);
    if (entry) {
      setSelected(entry);
      setPendingId(null);
    }
  }, [entries, pendingId]);

  const handleSelect = (entry: PromptEntry) => {
    setSelected(entry);
    window.history.pushState({ p: entry.id }, '', `?p=${entry.id}`);
  };

  const handleClose = () => {
    setSelected(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  // ── Search index (lazy, only for image-mode search) ─────────────────────
  const fetchAttempted = useRef(false);
  const parsedSearch   = useMemo(() => parseSearchQuery(search), [search]);

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
        fetchAttempted.current = false;
        setSearchIndexStatus('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedSearch.mode, parsedSearch.normalizedTerm]);

  // ── Ranking ─────────────────────────────────────────────────────────────
  const qualityBoosted = useMemo(() => {
    return [...entries]
      .map((entry) => ({
        entry,
        rankValue: randomizedQualityRankValue(entry, shuffleSeed, imageQuality),
      }))
      .sort((a, b) => b.rankValue - a.rankValue)
      .map((item) => item.entry);
  }, [entries, imageQuality, shuffleSeed]);

  const pinScore = (list: PromptEntry[]) => {
    const pinned = list.filter((e) => (e.score ?? 0) > 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const normal = list.filter((e) => !((e.score ?? 0) > 0));
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
            score = scorePrefixSearch(entry, parsedSearch);
          } else if (indexReady) {
            const imgScore = scoreImageSearch(searchIndex?.entries?.[entry.id], parsedSearch);
            const txtScore = scorePromptText(entry, parsedSearch);
            const imgFinal = imgScore > 0
              ? (txtScore > 0 ? imgScore + txtScore * 0.35 : imgScore * 0.45)
              : 0;
            score = imgFinal > 0 ? imgFinal : txtScore * 0.6;
          } else {
            score = scorePromptText(entry, parsedSearch);
          }
          score += entry.hq ? 30 : 0;
          const qualityScore = getPromptQualityScore(entry, imageQuality);
          if (qualityScore !== null) score += qualityScore * 0.25;
          return { entry, score };
        })
        .filter((item) => item.score >= 38)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return compareBySecondarySort(a.entry, b.entry, sortBy);
        });
      result = scored.map((item) => item.entry);
    } else {
      result = qualityBoosted;
    }

    if (category !== 'all') result = result.filter((e) => e.category === category);
    if (lang !== 'all')     result = result.filter((e) => e.lang === lang);
    if (tagFilter)          result = result.filter((e) => e.tags.includes(tagFilter));

    return pinScore(result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, entries, imageQuality, lang, parsedSearch, qualityBoosted, searchIndex, searchIndexStatus, tagFilter]);

  const displayed = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore   = displayed.length < filtered.length;

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMoreRef  = useRef(hasMore);
  useEffect(() => { hasMoreRef.current = hasMore; });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) setPage((p) => p + 1);
      },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const { columnCount, columns, containerRef } = useMasonryColumns(displayed);
  const eagerImageCount = Math.min(displayed.length, Math.max(12, columnCount * 4));

  const handleTagClick = (tag: string) => {
    setTagFilter((prev) => (prev === tag ? '' : tag));
    setPage(1);
  };

  const isZh     = tx.langToggle === 'EN';
  const heroDate = new Date()
    .toLocaleString(isZh ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  return (
    <>
      {/* ── Hero strip ── */}
      <div className="max-w-[1800px] mx-auto" style={{ padding: '28px 20px 8px' }}>
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

        {/* Active tag chip */}
        {tagFilter && (
          <div style={{ paddingTop: 12, paddingBottom: 4 }}>
            <button
              onClick={() => setTagFilter('')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 99, fontSize: 12,
                background: '#1a1714', color: '#f6f3ec',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {tagFilter}
              <span style={{ opacity: 0.7, fontSize: 15 }}>×</span>
            </button>
          </div>
        )}
      </div>

      <main className="max-w-[1800px] mx-auto px-2.5 sm:px-4 py-3 sm:py-4">
        {/* containerRef must always be in the DOM so ResizeObserver fires on mount */}
        <div
          ref={containerRef}
          className="masonry-grid"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {dataLoading
            ? Array.from({ length: columnCount * 3 }).map((_, i) => (
                <div key={i} className="masonry-column">
                  <div
                    className="skeleton rounded-lg"
                    style={{ width: '100%', aspectRatio: `1 / ${1 + (i % 3) * 0.3}` }}
                  />
                </div>
              ))
            : columns.map((column, columnIndex) => (
                <div className="masonry-column" key={columnIndex}>
                  {column.map(({ entry, index }) => (
                    <PromptCard
                      key={entry.id}
                      entry={entry}
                      loading={index < eagerImageCount ? 'eager' : 'lazy'}
                      onClick={() => handleSelect(entry)}
                    />
                  ))}
                </div>
              ))
          }
        </div>

        {!dataLoading && displayed.length === 0 && (
          <div
            className="text-center py-24 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {tx.noResults}
          </div>
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />

        {!hasMore && displayed.length > 0 && (
          <p className="text-center text-xs pb-10 pt-6" style={{ color: 'var(--text-secondary)' }}>
            {tx.showingAll(displayed.length)}
          </p>
        )}
      </main>

      {selected && (() => {
        const idx = filtered.findIndex((e) => e.id === selected.id);
        return (
          <PromptModal
            entry={selected}
            onClose={handleClose}
            onTagClick={handleTagClick}
            hasPrev={idx > 0}
            hasNext={idx < filtered.length - 1}
            onPrev={() => {
              if (idx > 0) handleSelect(filtered[idx - 1]);
            }}
            onNext={() => {
              if (idx < filtered.length - 1) handleSelect(filtered[idx + 1]);
            }}
          />
        );
      })()}
    </>
  );
}
