'use client';

import type { SortBy } from '@/lib/types';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'photography', label: 'Photography' },
  { value: 'poster', label: 'Poster' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'ui', label: 'UI' },
  { value: 'infographic', label: 'Infographic' },
  { value: 'logo', label: 'Logo' },
  { value: 'other', label: 'Other' },
];

const LANGS = [
  { value: 'all', label: 'All languages' },
  { value: 'en', label: 'EN' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
];

const SORTS: { value: SortBy; label: string }[] = [
  { value: 'likes', label: 'Most liked' },
  { value: 'views', label: 'Most viewed' },
  { value: 'recent', label: 'Recent' },
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
  count: number;
  total: number;
}

export default function SearchFilterBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  lang,
  onLangChange,
  sortBy,
  onSortChange,
  tagFilter,
  onTagFilterClear,
  count,
  total,
}: Props) {
  return (
    <div
      className="sticky top-14 z-30 border-b"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Search row */}
      <div className="max-w-screen-2xl mx-auto px-4 pt-3 pb-2">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search prompts, authors..."
            className="w-full pl-9 pr-4 py-2 rounded-full text-sm border outline-none focus:ring-2 focus:ring-gray-900/20 transition"
            style={{ borderColor: 'var(--border)', background: '#f9f9f9' }}
          />
        </div>
      </div>

      {/* Filter row */}
      <div className="max-w-screen-2xl mx-auto px-4 pb-2.5 flex items-center gap-3 overflow-x-auto scrollbar-none">
        {/* Category pills */}
        <div className="flex gap-1.5 shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => onCategoryChange(cat.value)}
              className={`tag-pill ${category === cat.value ? 'active' : ''}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-gray-200 shrink-0" />

        {/* Language filter */}
        <div className="flex gap-1.5 shrink-0">
          {LANGS.map((l) => (
            <button
              key={l.value}
              onClick={() => onLangChange(l.value)}
              className={`tag-pill ${lang === l.value ? 'active' : ''}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-gray-200 shrink-0" />

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="text-xs border rounded-full px-3 py-1 outline-none cursor-pointer shrink-0"
          style={{ borderColor: 'var(--border)', background: '#f9f9f9', color: 'var(--text-secondary)' }}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

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

        {/* Result count */}
        <span className="ml-auto text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {count === total ? `${total} prompts` : `${count} of ${total}`}
        </span>
      </div>
    </div>
  );
}
