'use client';

import type { SortBy } from '@/lib/types';

const CATEGORIES = [
  { value: 'all',         label: '全部' },
  { value: 'manga',       label: '漫画' },
  { value: 'advertising', label: '广告' },
  { value: 'game',        label: '游戏' },
  { value: 'portrait',    label: '人像' },
  { value: 'photography', label: '摄影' },
  { value: 'poster',      label: '海报' },
  { value: 'illustration',label: '插画' },
  { value: 'ui',          label: 'UI' },
  { value: 'infographic', label: '信息图' },
  { value: 'logo',        label: 'Logo' },
  { value: 'other',       label: '其他' },
];

const LANGS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'en',  label: 'EN' },
  { value: 'zh',  label: '中文' },
  { value: 'ja',  label: '日本語' },
];

const SORTS: { value: SortBy; label: string }[] = [
  { value: 'likes',  label: '最多点赞' },
  { value: 'views',  label: '最多浏览' },
  { value: 'recent', label: '最新' },
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
      {/* Search + right controls */}
      <div className="max-w-screen-2xl mx-auto px-4 pt-2.5 pb-2 flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }}
            width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索提示词、作者..."
            className="w-full pl-9 pr-4 py-2 rounded-full text-sm border outline-none focus:ring-2 focus:ring-gray-900/20 transition"
            style={{ borderColor: 'var(--border)', background: '#f8f8f8', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Lang selector — hidden on small screens, shown beside search on sm+ */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {LANGS.map((l) => (
            <button
              key={l.value}
              onClick={() => onLangChange(l.value)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                lang === l.value
                  ? 'text-white'
                  : 'hover:bg-gray-100'
              }`}
              style={lang === l.value ? { background: 'var(--text-primary)', color: '#fff' } : { color: 'var(--text-secondary)' }}
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
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Count */}
        <span className="hidden sm:block text-xs shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {count === total ? `${total.toLocaleString()} 个` : `${count} / ${total}`}
        </span>
      </div>

      {/* Category + mobile extras row */}
      <div className="relative">
        {/* Left/right fade hints */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-8 z-10"
          style={{ background: 'linear-gradient(to right, var(--card), transparent)' }} />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 z-10"
          style={{ background: 'linear-gradient(to left, var(--card), transparent)' }} />

        <div className="max-w-screen-2xl mx-auto px-4 pb-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {/* Category pills */}
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => onCategoryChange(cat.value)}
              className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                category === cat.value ? '' : 'hover:bg-gray-100'
              }`}
              style={
                category === cat.value
                  ? { background: 'var(--text-primary)', color: '#fff' }
                  : { background: '#f0f0f0', color: 'var(--text-secondary)' }
              }
            >
              {cat.label}
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-4 bg-gray-200 shrink-0" />

          {/* Mobile-only: lang + sort */}
          <div className="flex sm:hidden items-center gap-1 shrink-0">
            {LANGS.map((l) => (
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
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
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
            {count === total ? `${total.toLocaleString()} 个` : `${count}/${total}`}
          </span>
        </div>
      </div>
    </div>
  );
}
