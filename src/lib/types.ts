export interface PromptEntry {
  id: string;
  title: string;
  thumbnail: string;
  thumbnailAspect: number;
  author: string;
  authorUrl: string;
  tags: string[];
  category: string;
  lang: string;
  stats: {
    likes: number;
    retweets: number;
    views: number;
  };
  createdAt: string;
  prompt: string;
  outputImages: string[];
  sourceUrl: string;
  sourceId?: string;
  hq?: boolean;
  approved?: boolean;
  pending?: boolean;
}

export interface ImageQualityImageScore {
  score: number;
  rawScore?: number;
  tier: string;
  entryId: string;
  category: string;
}

export interface ImageQualityEntryScore {
  score: number;
  rawScore?: number;
  tier: string;
  bestImage: string;
  averageScore: number;
  scoredImages: number;
}

export interface ImageQualityData {
  version: number;
  generatedAt: string | null;
  model: string | null;
  complete?: boolean;
  sourceReport?: string;
  scoreSpread?: {
    strategy?: string;
    center?: number;
    multiplier?: number;
    min: number;
    max: number;
  };
  summary?: {
    total: number;
    scored: number;
    failures: number;
    averageScore: number | null;
    tierCounts: Record<string, number>;
  };
  images: Record<string, ImageQualityImageScore>;
  entries: Record<string, ImageQualityEntryScore>;
}

export type SortBy = 'likes' | 'views' | 'recent';
export type LangFilter = 'all' | 'en' | 'zh' | 'ja' | 'other';

export interface LocalizedSearchText {
  zh: string;
  en: string;
  ja: string;
}

export interface LocalizedSearchKeywords {
  zh: string[];
  en: string[];
  ja: string[];
}

export interface ImageSearchDoc {
  id: string;
  caption: LocalizedSearchText;
  keywords: LocalizedSearchKeywords;
  visibleText: string[];
  objects: string[];
  searchText: string;
  version: string;
  imagePaths?: string[];
}

export interface SearchIndexFile {
  version: string;
  generatedAt: string;
  entries: Record<string, ImageSearchDoc>;
}

export const CATEGORIES = [
  'all',
  'manga',
  'advertising',
  'game',
  'portrait',
  'photography',
  'poster',
  'illustration',
  'ui',
  'infographic',
  'logo',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];
