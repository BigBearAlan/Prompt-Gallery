import { readFile } from 'fs/promises';
import { createHash } from 'crypto';

export const VALID_CATEGORIES = [
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
];

export const CATEGORY_LABELS = {
  manga: 'Manga',
  advertising: 'Advertising',
  game: 'Game',
  portrait: 'Portrait',
  photography: 'Photography',
  poster: 'Poster',
  illustration: 'Illustration',
  ui: 'UI',
  infographic: 'Infographic',
  logo: 'Logo',
  other: 'Other',
};

const CATEGORY_RULES = {
  manga: [
    ['manga page', 9],
    ['comic page', 9],
    ['comic book page', 9],
    ['comic strip', 9],
    ['webtoon', 8],
    ['4-panel comic', 9],
    ['four-panel comic', 9],
    ['4-panel manga', 9],
    ['four-panel manga', 9],
    ['8-panel', 7],
    ['shonen manga', 9],
    ['shoujo manga', 9],
    ['manga spread', 10],
    ['manga panel', 10],
    ['yonkoma', 8],
    ['manga', 8],
    ['comic', 7],
    ['漫画页面', 9],
    ['漫画页', 9],
    ['四格漫画', 9],
    ['4格漫画', 9],
    ['分镜漫画', 8],
    ['连环画', 8],
    ['小人书', 8],
    ['漫画', 8],
    ['漫画ページ', 9],
    ['4コマ漫画', 9],
    ['マンガ', 8],
    ['コミック', 8],
  ],
  advertising: [
    ['advertisement', 8],
    ['advertising', 8],
    ['ad banner', 8],
    ['banner ad', 8],
    ['banner ads', 8],
    ['product ad', 8],
    ['campaign', 7],
    ['promotion campaign', 7],
    ['promotional campaign', 7],
    ['promotional poster', 7],
    ['promo poster', 7],
    ['promo banner', 8],
    ['flyer', 7],
    ['e-commerce', 7],
    ['ecommerce', 7],
    ['marketing', 5],
    ['广告', 8],
    ['商品广告', 9],
    ['促销', 8],
    ['推广', 8],
    ['宣传图', 8],
    ['宣传海报', 7],
    ['电商', 7],
    ['折り込みチラシ', 8],
    ['広告', 8],
    ['宣伝', 8],
    ['販促', 8],
    ['バナー広告', 8],
    ['プロモーション', 8],
  ],
  game: [
    ['game screenshot', 9],
    ['in-game screenshot', 9],
    ['ingame screenshot', 9],
    ['game ui', 9],
    ['game hud', 9],
    ['video game', 7],
    ['gaming', 7],
    ['game stream', 8],
    ['game asset', 7],
    ['game assets', 7],
    ['hud', 7],
    ['rpg', 7],
    ['fps', 7],
    ['boss battle', 7],
    ['gacha', 8],
    ['trading card', 7],
    ['collectible card', 7],
    ['character card', 6],
    ['minecraft', 8],
    ['tetris', 6],
    ['游戏截图', 9],
    ['游戏界面', 9],
    ['游戏 ui', 9],
    ['游戏UI', 9],
    ['游戏', 6],
    ['卡牌', 7],
    ['抽卡', 8],
    ['ゲーム画面', 9],
    ['ゲーム', 6],
    ['ガチャ', 8],
    ['カード', 6],
    ['マイクラ', 8],
    ['ステータス画面', 8],
    ['魔兽', 8],
    ['魔兽世界', 9],
    ['团队副本', 8],
  ],
  ui: [
    ['ui', 5],
    ['interface', 5],
    ['dashboard', 5],
    ['wireframe', 5],
    ['mockup', 5],
    ['app screen', 5],
    ['landing page', 5],
    ['website', 4],
    ['profile page', 4],
    ['profile screen', 4],
    ['screenshot', 3],
    ['screen', 2],
    ['screen mockup', 5],
    ['homepage', 4],
    ['social profile', 5],
    ['界面', 5],
    ['网页', 5],
    ['页面', 4],
    ['主页', 5],
    ['应用', 4],
    ['截图', 4],
    ['主页截图', 6],
    ['直播间', 5],
    ['商品详情页', 6],
    ['屏幕样机', 6],
    ['手机屏幕', 5],
    ['屏幕', 4],
    ['直播', 3],
    ['画面', 3],
    ['ステータス画面', 5],
    ['ランディングページ', 5],
  ],
  infographic: [
    ['infographic', 6],
    ['diagram', 5],
    ['exploded view', 5],
    ['timeline', 5],
    ['chart', 4],
    ['map', 4],
    ['information design', 4],
    ['information graphic', 6],
    ['info dense', 5],
    ['science popularization', 10],
    ['encyclopedia', 8],
    ['encyclopedic', 8],
    ['atlas-like', 8],
    ['knowledge card', 7],
    ['modular information', 7],
    ['flowchart', 5],
    ['scientific graph', 5],
    ['question layout', 4],
    ['recipe', 4],
    ['breakdown', 4],
    ['periodic table', 5],
    ['科普', 6],
    ['信息图', 6],
    ['图解', 6],
    ['结构', 4],
    ['元素周期表', 6],
    ['地图', 4],
    ['攻略', 3],
    ['流程图', 6],
    ['制作流程', 5],
    ['図解', 6],
    ['解説', 4],
    ['図鑑', 4],
  ],
  poster: [
    ['poster', 6],
    ['movie poster', 6],
    ['film poster', 6],
    ['key visual', 5],
    ['banner', 5],
    ['thumbnail', 5],
    ['album cover', 5],
    ['cover', 3],
    ['advertisement', 4],
    ['advertising', 4],
    ['social media', 3],
    ['e-commerce', 3],
    ['海报', 6],
    ['广告', 5],
    ['宣传', 4],
    ['封面', 4],
    ['横幅', 4],
    ['电商', 3],
    ['ポスター', 6],
    ['広告', 5],
    ['バナー', 4],
    ['サムネイル', 4],
  ],
  logo: [
    ['logo', 7],
    ['wordmark', 7],
    ['brand identity', 6],
    ['identity system', 4],
    ['标志', 7],
    ['品牌识别', 6],
    ['ロゴ', 7],
  ],
  illustration: [
    ['illustration', 5],
    ['painting', 5],
    ['watercolor', 5],
    ['pixel art', 5],
    ['anime', 5],
    ['cartoon', 5],
    ['character design', 4],
    ['character reference', 5],
    ['reference sheet', 5],
    ['sticker sheet', 5],
    ['sticker set', 5],
    ['icon set', 4],
    ['3d render', 3],
    ['cyberpunk', 3],
    ['插画', 5],
    ['绘画', 5],
    ['水彩', 5],
    ['像素', 5],
    ['卡通', 5],
    ['动画', 4],
    ['角色设定', 4],
    ['角色设计图', 5],
    ['参考图', 4],
    ['贴纸', 5],
    ['水墨', 4],
    ['イラスト', 5],
    ['アニメ', 5],
  ],
  portrait: [
    ['portrait', 5],
    ['headshot', 5],
    ['selfie', 4],
    ['avatar portrait', 4],
    ['profile photo', 4],
    ['studio portrait', 4],
    ['idol portrait', 4],
    ['face', 2],
    ['人像', 5],
    ['肖像', 5],
    ['头像', 4],
    ['美女', 3],
    ['女孩', 3],
    ['男孩', 3],
    ['模特', 3],
    ['ポートレート', 5],
    ['人物写真', 4],
    ['アイドル', 3],
  ],
  photography: [
    ['photography', 5],
    ['photograph', 5],
    ['photo', 4],
    ['camera', 4],
    ['35mm', 4],
    ['film grain', 4],
    ['analog', 4],
    ['fujifilm', 4],
    ['ccd', 4],
    ['lens', 3],
    ['bokeh', 3],
    ['landscape photo', 3],
    ['摄影', 5],
    ['照片', 4],
    ['相机', 4],
    ['胶片', 4],
    ['写真', 4],
    ['風景写真', 4],
  ],
};

const CATEGORY_PRIORITY = [
  'manga',
  'game',
  'advertising',
  'ui',
  'infographic',
  'poster',
  'logo',
  'illustration',
  'portrait',
  'photography',
];

const YOUMIND_SECTION_MAP = {
  profile: 'portrait',
  avatar: 'portrait',
  portrait: 'portrait',
  photography: 'photography',
  landscape: 'photography',
  'social media': 'poster',
  youtube: 'poster',
  poster: 'poster',
  'e-commerce': 'advertising',
  thumbnail: 'advertising',
  banner: 'advertising',
  anime: 'illustration',
  manga: 'manga',
  comic: 'manga',
  illustration: 'illustration',
  '3d render': 'illustration',
  pixel: 'illustration',
  cyberpunk: 'illustration',
  game: 'game',
  character: 'illustration',
  infographic: 'infographic',
  map: 'infographic',
  diagram: 'infographic',
  exploded: 'infographic',
  evolutionary: 'infographic',
  ui: 'ui',
  interface: 'ui',
  logo: 'logo',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAsciiTerm(term) {
  return /^[a-z0-9+#.\s-]+$/i.test(term);
}

function termMatches(text, term) {
  if (!term) return false;
  if (!isAsciiTerm(term)) return text.includes(term);

  const escaped = escapeRegExp(term).replace(/\\ /g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export function detectCategory(text) {
  const lower = String(text || '').toLowerCase();
  const scores = Object.fromEntries(CATEGORY_PRIORITY.map((category) => [category, 0]));

  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    for (const [term, weight] of rules) {
      if (termMatches(lower, term.toLowerCase())) scores[category] += weight;
    }
  }

  let bestCategory = 'other';
  let bestScore = 0;
  for (const category of CATEGORY_PRIORITY) {
    if (scores[category] > bestScore) {
      bestCategory = category;
      bestScore = scores[category];
    }
  }

  return bestCategory;
}

export function mapYouMindSection(section) {
  const lower = String(section || '').toLowerCase();
  for (const [key, category] of Object.entries(YOUMIND_SECTION_MAP)) {
    if (lower.includes(key)) return category;
  }
  return detectCategory(section);
}

export function extractTags(text, lang, category) {
  const tags = new Set([lang || 'en']);
  if (category && category !== 'other') tags.add(category);
  for (const [, tag] of String(text || '').matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    if (tag.length > 1 && tag.length < 20) tags.add(tag.toLowerCase());
  }
  return [...tags].slice(0, 8);
}

export function truncate(s, n = 80) {
  const value = String(s || '');
  return value.length > n ? `${value.slice(0, n - 1)}…` : value;
}

export async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export function normalizeCuration(raw = {}) {
  return {
    version: raw.version || 1,
    entries: raw.entries && typeof raw.entries === 'object' ? raw.entries : {},
  };
}

export async function loadCuration(filePath) {
  return normalizeCuration(await loadJson(filePath, { version: 1, entries: {} }));
}

function validateCategory(category, id) {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category "${category}" for ${id}. Use one of: ${VALID_CATEGORIES.join(', ')}`);
  }
}

export function tagsWithCategory(tags, lang, category) {
  const next = new Set((tags || []).filter((tag) => !VALID_CATEGORIES.includes(tag)));
  if (lang) next.add(lang);
  if (category !== 'other') next.add(category);
  return [...next].slice(0, 8);
}

export function applyCuration(entries, curation) {
  const normalized = normalizeCuration(curation);
  const stats = {
    hidden: 0,
    categoryOverrides: 0,
    titleOverrides: 0,
    tagChanges: 0,
  };

  const curatedEntries = [];
  for (const entry of entries) {
    const override = normalized.entries[entry.id];
    if (override?.hidden) {
      stats.hidden++;
      continue;
    }

    const next = {
      ...entry,
      tags: [...(entry.tags || [])],
      stats: { ...(entry.stats || {}) },
      outputImages: [...(entry.outputImages || [])],
    };

    if (override?.category) {
      validateCategory(override.category, entry.id);
      next.category = override.category;
      next.tags = tagsWithCategory(next.tags, next.lang, next.category);
      stats.categoryOverrides++;
    }

    if (override?.title) {
      next.title = override.title;
      stats.titleOverrides++;
    }

    if (Array.isArray(override?.tags)) {
      next.tags = [...new Set(override.tags)].slice(0, 8);
      stats.tagChanges++;
    } else {
      if (Array.isArray(override?.removeTags)) {
        const remove = new Set(override.removeTags);
        next.tags = next.tags.filter((tag) => !remove.has(tag));
        stats.tagChanges++;
      }
      if (Array.isArray(override?.addTags)) {
        next.tags = [...new Set([...next.tags, ...override.addTags])].slice(0, 8);
        stats.tagChanges++;
      }
    }

    curatedEntries.push(next);
  }

  return { entries: curatedEntries, stats };
}

function shortHash(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 8);
}

function uniqueSuffixFor(entry) {
  return shortHash([
    entry.sourceUrl || '',
    entry.title || '',
    entry.prompt || '',
    entry.thumbnail || '',
  ].join('\n'));
}

export function findDuplicateIdGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.id)) groups.set(entry.id, []);
    groups.get(entry.id).push(entry);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

export function ensureUniqueEntryIds(entries) {
  const duplicateIds = new Set(findDuplicateIdGroups(entries).map(([id]) => id));
  const seen = new Set();
  let idsChanged = 0;

  const uniqueEntries = entries.map((entry) => {
    if (!duplicateIds.has(entry.id) || !seen.has(entry.id)) {
      seen.add(entry.id);
      return entry;
    }

    const sourceId = entry.sourceId || entry.id;
    let nextId = `${sourceId}-${uniqueSuffixFor(entry)}`;
    let n = 2;
    while (seen.has(nextId)) {
      nextId = `${sourceId}-${uniqueSuffixFor(entry)}-${n++}`;
    }
    seen.add(nextId);
    idsChanged++;
    return { ...entry, id: nextId, sourceId };
  });

  return {
    entries: uniqueEntries,
    stats: {
      duplicateIdGroups: duplicateIds.size,
      idsChanged,
    },
  };
}

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[\p{L}\p{N}_-]+/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findDuplicatePromptGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = normalizeText(entry.prompt);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length || b[0].stats.likes - a[0].stats.likes);
}
