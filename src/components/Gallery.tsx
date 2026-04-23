'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { PromptEntry, SortBy } from '@/lib/types';
import PromptCard from './PromptCard';
import PromptModal from './PromptModal';
import SearchFilterBar from './SearchFilterBar';

const PAGE_SIZE = 48;

interface Props {
  entries: PromptEntry[];
}

export default function Gallery({ entries }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [lang, setLang] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('likes');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [tagFilter, setTagFilter] = useState('');

  // Shuffle once per session (stable across re-renders, new order on page reload)
  const sessionSeed = useRef(Math.random());
  const shuffled = useMemo(() => {
    const arr = [...entries];
    let seed = sessionSeed.current;
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [entries]);

  const filtered = useMemo(() => {
    let result = shuffled;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.prompt.toLowerCase().includes(q) ||
          e.author.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      );
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

    if (sortBy === 'likes') return [...result].sort((a, b) => b.stats.likes - a.stats.likes);
    if (sortBy === 'views') return [...result].sort((a, b) => b.stats.views - a.stats.views);
    return result; // 'recent' keeps the session shuffle order
  }, [shuffled, search, category, lang, sortBy, tagFilter]);

  const displayed = useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page]
  );

  const hasMore = displayed.length < filtered.length;

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
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
            没有找到匹配的提示词，请尝试调整筛选条件。
          </div>
        ) : (
          <div className="masonry">
            {displayed.map((entry) => (
              <PromptCard
                key={entry.id}
                entry={entry}
                onClick={() => setSelected(entry)}
                onTagClick={handleTagClick}
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
              加载更多（剩余 {filtered.length - displayed.length} 个）
            </button>
          </div>
        )}

        {!hasMore && displayed.length > 0 && (
          <p
            className="text-center text-xs pb-8 pt-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            已显示全部 {displayed.length} 个提示词
          </p>
        )}
      </main>

      {selected && (
        <PromptModal
          entry={selected}
          onClose={() => setSelected(null)}
          onTagClick={handleTagClick}
        />
      )}
    </>
  );
}
