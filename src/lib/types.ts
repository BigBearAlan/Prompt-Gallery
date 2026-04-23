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
}

export type SortBy = 'likes' | 'views' | 'recent';
export type LangFilter = 'all' | 'en' | 'zh' | 'ja' | 'other';

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
