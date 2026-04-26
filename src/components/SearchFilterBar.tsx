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
  category: string;
  onCategoryChange: (v: string) => void;
  lang: string;
  onLangChange: (v: string) => void;
  sortBy: SortBy;
  onSortChange: (v: SortBy) => void;
  tagFilter: string;
  onTagFilterClear: () => void;
  compact?: boolean;
}

export default function SearchFilterBar({
  search, onSearchChange,
  category, onCategoryChange,
  lang, onLangChange,
  sortBy, onSortChange,
  tagFilter, onTagFilterClear,
  compact = false,
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
      className={`sticky top-16 z-30 overflow-hidden backdrop-blur-xl transition-[max-height,opacity,transform,border-color] duration-200 ${
        compact
          ? 'max-h-0 -translate-y-1 border-b-0 opacity-0 pointer-events-none'
          : 'max-h-40 translate-y-0 border-b opacity-100 pointer-events-auto'
      }`}
      aria-hidden={compact}
      style={{
        background: 'rgba(255,255,255,0.88)',
        borderColor: compact ? 'transparent' : 'var(--border)',
      }}
    >
      <div className="max-w-[1800px] mx-auto px-3 sm:px-5 pt-3 pb-2.5 flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 max-w-4xl">
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
            className="w-full pl-9 pr-4 py-2.5 rounded-full text-sm border outline-none focus:ring-2 focus:ring-gray-900/10 transition"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {langOptions.map((l) => (
            <button
              key={l.value}
              onClick={() => onLangChange(l.value)}
              className={`text-xs px-3 py-2 rounded-full font-medium transition-colors ${
                lang === l.value ? 'text-white' : 'hover:bg-gray-50'
              }`}
              style={lang === l.value
                ? { background: 'var(--text-primary)', color: '#fff' }
                : { color: 'var(--text-secondary)' }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          aria-label="Sort prompts"
          className="hidden sm:block text-xs border rounded-full px-3 py-2 outline-none cursor-pointer shrink-0 transition"
          style={{ borderColor: 'var(--border)', background: '#fff', color: 'var(--text-secondary)' }}
        >
          {SORT_VALUES.map((v) => (
            <option key={v} value={v}>{sortLabels[v]}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-8 z-10"
          style={{ background: 'linear-gradient(to right, var(--card), transparent)' }} />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 z-10"
          style={{ background: 'linear-gradient(to left, var(--card), transparent)' }} />

        <div className="max-w-[1800px] mx-auto px-3 sm:px-5 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {CATEGORY_VALUES.map((val) => (
            <button
              key={val}
              onClick={() => onCategoryChange(val)}
              className={`shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                category === val ? '' : 'hover:bg-gray-50'
              }`}
              style={
                category === val
                  ? { background: 'var(--text-primary)', color: '#fff' }
                  : { background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              }
            >
              {tx.catLabels[val]}
            </button>
          ))}

          <div className="w-px h-4 bg-gray-200 shrink-0" />

          <div className="flex sm:hidden items-center gap-1 shrink-0">
            {langOptions.map((l) => (
              <button
                key={l.value}
                onClick={() => onLangChange(l.value)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors shrink-0 ${
                  lang === l.value ? '' : 'hover:bg-gray-50'
                }`}
                style={
                  lang === l.value
                    ? { background: 'var(--text-primary)', color: '#fff' }
                    : { background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }
              >
                {l.label}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortBy)}
              aria-label="Sort prompts"
              className="text-xs border rounded-full px-3 py-1.5 outline-none cursor-pointer shrink-0"
              style={{ borderColor: 'var(--border)', background: '#fff', color: 'var(--text-secondary)' }}
            >
              {SORT_VALUES.map((v) => (
                <option key={v} value={v}>{sortLabels[v]}</option>
              ))}
            </select>
          </div>

          {tagFilter && (
            <button
              onClick={onTagFilterClear}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium shrink-0"
              style={{ background: '#111', color: '#fff' }}
            >
              #{tagFilter}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
