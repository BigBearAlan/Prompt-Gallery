'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { SortBy } from './types';

export type Locale = 'zh' | 'en';

export interface Translation {
  // Header
  tagline: string;
  langToggle: string;

  // Search / filter bar
  searchPlaceholder: string;
  sortLikes: string;
  sortViews: string;
  sortRecent: string;
  catLabels: Record<string, string>;
  langAll: string;
  countAll: (n: number) => string;
  countFiltered: (n: number, total: number) => string;

  // Gallery
  noResults: string;
  loadMore: (n: number) => string;
  showingAll: (n: number) => string;

  // Card
  viewPrompt: string;
  noImage: string;

  // Modal
  tabImage: string;
  tabPrompt: string;
  promptTemplate: string;
  promptHint: string;
  chars: (n: number) => string;
  edited: string;
  copied: string;
  copyPrompt: string;
  source: string;
  reset: string;
  imageUnavailable: string;
  close: string;
}

export const translations: Record<Locale, Translation> = {
  zh: {
    tagline: '全网最全的 GPT Image 2.0 生图词库',
    langToggle: 'EN',

    searchPlaceholder: '搜索提示词、作者...',
    sortLikes: '最多点赞',
    sortViews: '最多浏览',
    sortRecent: '最新',
    catLabels: {
      all: '全部', manga: '漫画', advertising: '广告', game: '游戏',
      portrait: '人像', photography: '摄影', poster: '海报',
      illustration: '插画', ui: 'UI', infographic: '信息图', logo: 'Logo', other: '其他',
    },
    langAll: '全部',
    countAll: (n) => `${n.toLocaleString()} 个`,
    countFiltered: (n, total) => `${n} / ${total}`,

    noResults: '没有找到匹配的提示词，请尝试调整筛选条件。',
    loadMore: (n) => `加载更多（剩余 ${n} 个）`,
    showingAll: (n) => `已显示全部 ${n} 个提示词`,

    viewPrompt: '查看提示词',
    noImage: '暂无图片',

    tabImage: '图片',
    tabPrompt: '提示词',
    promptTemplate: '提示词模板',
    promptHint: '在下方编辑提示词，然后复制到您的 AI 工具中使用。',
    chars: (n) => `${n} 字符`,
    edited: '已编辑',
    copied: '已复制！',
    copyPrompt: '复制提示词',
    source: '来源',
    reset: '重置',
    imageUnavailable: '图片不可用',
    close: '关闭',
  },

  en: {
    tagline: 'The most comprehensive GPT Image 2.0 prompt library',
    langToggle: '中文',

    searchPlaceholder: 'Search prompts, authors...',
    sortLikes: 'Most Liked',
    sortViews: 'Most Viewed',
    sortRecent: 'Recent',
    catLabels: {
      all: 'All', manga: 'Manga', advertising: 'Advertising', game: 'Game',
      portrait: 'Portrait', photography: 'Photography', poster: 'Poster',
      illustration: 'Illustration', ui: 'UI', infographic: 'Infographic', logo: 'Logo', other: 'Other',
    },
    langAll: 'All',
    countAll: (n) => `${n.toLocaleString()}`,
    countFiltered: (n, total) => `${n} / ${total}`,

    noResults: 'No prompts found. Try adjusting your filters.',
    loadMore: (n) => `Load more (${n} remaining)`,
    showingAll: (n) => `Showing all ${n} prompts`,

    viewPrompt: 'View Prompt',
    noImage: 'No image',

    tabImage: 'Image',
    tabPrompt: 'Prompt',
    promptTemplate: 'Prompt Template',
    promptHint: 'Edit the prompt below, then copy it to your AI tool.',
    chars: (n) => `${n} chars`,
    edited: 'edited',
    copied: 'Copied!',
    copyPrompt: 'Copy Prompt',
    source: 'Source',
    reset: 'Reset',
    imageUnavailable: 'Image unavailable',
    close: 'Close',
  },
};

// ── sorts (values are stable; labels come from tx) ──────────────────────────
export const SORT_VALUES: SortBy[] = ['likes', 'views', 'recent'];

// ── context ──────────────────────────────────────────────────────────────────

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  tx: Translation;
}

const LocaleContext = createContext<LocaleCtx>({
  locale: 'zh',
  setLocale: () => {},
  tx: translations.zh,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ui-locale') as Locale | null;
      if (stored === 'en' || stored === 'zh') { setLocaleState(stored); return; }
      // Auto-detect: default to zh unless browser is clearly English-only
      const nav = navigator.language.toLowerCase();
      if (nav.startsWith('en') && !nav.includes('hk') && !nav.includes('tw') && !nav.includes('sg')) {
        setLocaleState('en');
      }
    } catch { /* localStorage may be blocked */ }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem('ui-locale', l); } catch { /* ignore */ }
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, tx: translations[locale] }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
