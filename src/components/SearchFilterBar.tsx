'use client';

import { useState, useEffect, useRef } from 'react';
import type { SortBy } from '@/lib/types';
import { useLocale, SORT_VALUES } from '@/lib/i18n';

const CATEGORY_VALUES = [
  'all', 'manga', 'advertising', 'game', 'portrait', 'photography',
  'poster', 'illustration', 'ui', 'infographic', 'logo', 'other',
];

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '' }, // label filled from tx.langAll
  { value: 'en',  label: 'EN' },
  { value: 'zh',  label: '中文' },
  { value: 'ja',  label: '日本語' },
];

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  searchInfo?: string;
  category: string;
  onCategoryChange: (v: string) => void;
  lang: string;
  onLangChange: (v: string) => void;
  sortBy: SortBy;
  onSortChange: (v: SortBy) => void;
  tagFilter: string;
  onTagFilterClear: () => void;
  count: number;
  total: number;
}

export default function SearchFilterBar({
  search, onSearchChange,
  searchInfo,
  category, onCategoryChange,
  lang, onLangChange,
  sortBy, onSortChange,
  tagFilter, onTagFilterClear,
  count, total,
}: Props) {
  const { tx } = useLocale();

  // Local display value — search only fires on Enter or the search button click,
  // never on every keystroke. IME composition is also tracked so Chinese/Japanese
  // input isn't interrupted mid-composition.
  const [localSearch, setLocalSearch] = useState(search);
  const composing = useRef(false);

  // Sync parent → local when the parent clears search (e.g. tag filter click)
  useEffect(() => {
    if (!composing.current) setLocalSearch(search);
  }, [search]);

  const commitSearch = (val: string) => {
    onSearchChange(val);
  };

  const sortLabels: Record<SortBy, string> = {
    likes: tx.sortLikes,
    views: tx.sortViews,
    recent: tx.sortRecent,
  };

  const langOptions = LANG_OPTIONS.map((l) =>
    l.value === 'all' ? { ...l, label: tx.langAll } : l
  );

  return (
    <div
      className="sticky top-14 z-30 border-b"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Search + right controls */}
      <div className="max-w-screen-2xl mx-auto px-4 pt-2.5 pb-2 flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => commitSearch(localSearch)}
            className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', padding: 0, lineHeight: 0 }}
            tabIndex={-1}
            aria-label="Search"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <input
            type="search"
            value={localSearch}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={(e) => {
              composing.current = false;
              setLocalSearch((e.currentTarget as HTMLInputElement).value);
            }}
            onChange={(e) => {
              const val = e.target.value;
              setLocalSearch(val);
              // Clear search immediately when field is emptied
              if (val === '') commitSearch('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !composing.current) commitSearch(localSearch);
            }}
            placeholder={tx.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 rounded-full text-sm border outline-none focus:ring-2 focus:ring-gray-900/20 transition"
            style={{ borderColor: 'var(--border)', background: '#f8f8f8', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Lang selector — desktop */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {langOptions.map((l) => (
            <button
              key={l.value}
              onClick={() => onLangChange(l.value)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                lang === l.value ? 'text-white' : 'hover:bg-gray-100'
              }`}
              style={lang === l.value
                ? { background: 'var(--text-primary)', color: '#fff' }
                : { color: 'var(--text-secondary)' }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Sort select */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="hidden sm:block text-xs border rounded-full px-3 py-1.5 outline-none cursor-pointer shrink-0 transition"
          style={{ borderColor: 'var(--border)', background: '#f8f8f8', color: 'var(--text-secondary)' }}
        >
          {SORT_VALUES.map((v) => (
            <option key={v} value={v}>{sortLabels[v]}</option>
          ))}
        </select>

        {/* Count */}
        <span className="hidden sm:block text-xs shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {count === total ? tx.countAll(total) : tx.countFiltered(count, total)}
        </span>
      </div>

      {searchInfo && (
        <div className="max-w-screen-2xl mx-auto px-4 pb-2">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {searchInfo}
          </p>
        </div>
      )}

      {/* Category + mobile extras row */}
      <div className="relative">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-8 z-10"
          style={{ background: 'linear-gradient(to right, var(--card), transparent)' }} />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 z-10"
          style={{ background: 'linear-gradient(to left, var(--card), transparent)' }} />

        <div className="max-w-screen-2xl mx-auto px-4 pb-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {/* Category pills */}
          {CATEGORY_VALUES.map((val) => (
            <button
              key={val}
              onClick={() => onCategoryChange(val)}
              className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                category === val ? '' : 'hover:bg-gray-100'
              }`}
              style={
                category === val
                  ? { background: 'var(--text-primary)', color: '#fff' }
                  : { background: '#f0f0f0', color: 'var(--text-secondary)' }
              }
            >
              {tx.catLabels[val]}
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-4 bg-gray-200 shrink-0" />

          {/* Mobile-only: lang + sort */}
          <div className="flex sm:hidden items-center gap-1 shrink-0">
            {langOptions.map((l) => (
              <button
                key={l.value}
                onClick={() => onLangChange(l.value)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors shrink-0 ${
                  lang === l.value ? '' : 'hover:bg-gray-100'
                }`}
                style={
                  lang === l.value
                    ? { background: 'var(--text-primary)', color: '#fff' }
                    : { background: '#f0f0f0', color: 'var(--text-secondary)' }
                }
              >
                {l.label}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortBy)}
              className="text-xs border rounded-full px-2.5 py-1 outline-none cursor-pointer shrink-0"
              style={{ borderColor: 'var(--border)', background: '#f0f0f0', color: 'var(--text-secondary)' }}
            >
              {SORT_VALUES.map((v) => (
                <option key={v} value={v}>{sortLabels[v]}</option>
              ))}
            </select>
          </div>

          {/* Active tag filter */}
          {tagFilter && (
            <button
              onClick={onTagFilterClear}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded-full font-medium shrink-0"
              style={{ background: '#111', color: '#fff' }}
            >
              #{tagFilter}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Mobile count */}
          <span className="sm:hidden ml-auto text-xs shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {count === total ? tx.countAll(total) : tx.countFiltered(count, total)}
          </span>
        </div>
      </div>
    </div>
  );
}
