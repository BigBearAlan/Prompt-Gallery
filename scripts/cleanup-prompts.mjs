/**
 * Cleanup script for prompts.json
 *
 * 1. Remove entries with empty prompts
 * 2. Deduplicate entries that share the same thumbnail image (keep highest-score)
 * 3. Deduplicate entries with very similar prompt text (>85% word overlap)
 * 4. Reclassify every entry: rule wins when specific; else keep existing category
 *
 * Run: node scripts/cleanup-prompts.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'src', 'data', 'prompts.json');

// ── category rules (most-specific first, first match wins) ────────────────────

// Each rule has two types of pattern:
// • English patterns use \b (works for ASCII)
// • CJK patterns omit \b (CJK chars are \W, so \b never fires between them)
const CATEGORY_RULES = [
  {
    name: 'manga',
    re: [
      /\b(manga|anime|webtoon|chibi|comic.?strip|storyboard (panel|grid|sheet|board|frame)|manga[- ]style|anime[- ]style|film.strip)\b/i,
      // CJK — no \b
      /漫画|アニメ|コミック|Q版|格漫|少年漫|少女漫|四格漫|分镜|コマ割り|动漫风格|卡通风格|ロボットアニメ|漫画页面|漫画风格|漫画战斗|漫画海报/,
    ],
  },
  {
    name: 'infographic',
    re: [
      /\b(infographic|exploded[- ]view|exploded diagram|technical diagram|schematic|mind map|flowchart|font specimen|type specimen|data visualization|timeline (design|infographic)|explainer (slide|page|graphic))\b/i,
      // CJK — no \b
      /信息图|思维导图|知识图谱|解剖图|结构图|架构图|剖面图|流程图|科普百科图|数据可视化|知识卡片|拓扑图|供应链图|AI架构|训练流程|网络架构|技术架构|旅行手账信息|旅游图谱/,
    ],
  },
  {
    name: 'game',
    re: [
      /\b(video game|game (ui|interface|screen|art|design|world|scene|asset)|rpg|dungeon|pixel art|8[- ]?bit|16[- ]?bit|status screen|skill tree|inventory|health bar|map screen|voxel|game over|level up|gacha screen|ガチャ)\b/i,
      // CJK — no \b
      /游戏界面|游戏场景|游戏角色|游戏画面|游戏风格|游戏设计|电子游戏|像素风|ゲーム|ソシャゲ|ガチャ画面|ステータス画面|VRChat|像素游戏/,
    ],
  },
  {
    name: 'logo',
    re: [
      /\b(logo design|logotype|wordmark|brand identity (system|kit|design|board)?|icon design)\b/i,
      /\b(design (a|an|the) logo|create (a|an) logo|generate (a|an) logo|make (a|an) logo)\b/i,
      // CJK — no \b (also catches "Logo 设计" with mixed script)
      /徽标设计|标志设计|商标设计|Logo设计|logo设计|吉祥物设计|IP形象设计|企业Logo|Logo 设计/i,
    ],
  },
  {
    name: 'advertising',
    re: [
      /\b(advertisement|ad campaign|promotional (material|design|image)|commercial|banner ad|newsletter|email (newsletter|template|campaign)|display ad|social media (ad|banner)|promotional banner|banner (variation|design|layout)|saas (ad|banner)|ad banner)\b/i,
      /\b([0-9]+[- ]?panel.{0,20}(ad|banner|advertisement))\b/i,
      // CJK — no \b
      /广告设计|广告图|广告素材|品牌推广|促销海报|电商广告|社媒广告|电商主图|产品广告|邮件通讯|邮件营销|促销邮件|电子邮件模板|横幅广告|销售横幅|宣传拼贴|广告海报|广告横幅|广告变体|广告拼贴|横幅设计|促销网页横幅|化妆品促销|全息.*广告|広告をリデザイン|商品広告/,
    ],
  },
  {
    name: 'ui',
    re: [
      /\b(ui design|ux design|interface design|mockup|wireframe|dashboard|figma|prototype|landing page|hero section|app store (screenshot|preview)|product detail page|checkout (page|screen)|e[- ]?commerce (page|product|listing|ui))\b/i,
      /\b(app (screen|design|mockup)|mobile (app|screen|ui)|web (app|design|ui)|screen design)\b/i,
      /\b(macOS|iOS|Android).{0,20}(app|ui|design|screen|interface|mockup)\b/i,
      /\bUI\b/,
      // CJK — no \b
      /界面设计|界面模型|界面原型|界面模拟|界面截图|页面设计|设计稿|交互设计|组件库|落地页|网站设计|网页设计|APP界面|用户界面|直播间界面|直播间UI|社交媒体界面|主页设计|个人主页|看板应用|看板界面|产品页面设计|手机界面|桌面界面/,
    ],
  },
  {
    name: 'poster',
    re: [
      /\b(poster|flyer|movie poster|concert poster|event poster|book cover|album cover|typographic poster|typography layout|newspaper (front page|cover|layout)|tabloid (cover|layout)|calendar (design|template)|catalog (layout|design)|collection catalog|fashion catalog)\b/i,
      // CJK — no \b
      /海报|传单|电影海报|宣传海报|封面设计|专辑封面|报纸头版|报纸版面|报纸封面|日历设计|日历排版|风景日历|宣传物料|杂志封面|画报|宣传图|联名海报|广告海报|旅行海报|时装目录|服装目录|商品目录|电影预告拼贴|日式电影预告/,
    ],
  },
  {
    name: 'illustration',
    re: [
      /\b(illustration|concept art|fanart|watercolor|oil painting|digital (art|illustration|painting)|flat (art|illustration)|vector (art|illustration)|fantasy (scene|art|illustration|map)|sci[- ]fi (scene|illustration)|surreal(ist)? (art|scene|illustration)|diorama|papercut|paper art|mecha|sticker (design|art|sheet)|character (reference|design) sheet|character sheet|3D (scene|render|diorama)|moodboard|skyline (art|illustration|render)|character expression (grid|sheet))\b/i,
      // CJK — no \b
      /插画风格|插画设计|场景插画|概念图|奇幻场景|奇幻世界|奇幻插画|奇幻地图|幻想场景|幻想世界|仙侠|武侠|魔幻场景|纸雕|剪纸风|水彩画|水彩风格|素描风|素描风格|低多边形|立体剪纸|赛博朋克场景|赛博朋克世界|3D场景|全景图|全景地图|贴纸设计|贴纸风格|角色设计图|角色设定图|动漫角色|机甲设计|ロボット|服装变体|表情网格|表情图|Q版小|Q版设计|书法(卷轴|艺术|诗意)|山水(画|场景|诗意)|山水国画|书法山水|天际线场景|天际线艺术|悬崖前哨|暗黑奇幻|北欧战士|神兽|史诗级|壁画|黑板壁画|国画|禅意/,
    ],
  },
  {
    name: 'portrait',
    re: [
      /\b(portrait|headshot|full[- ]body portrait|studio portrait|character portrait|half[- ]body|photo(realistic)? (portrait|of a (woman|man|person|girl|boy|alien))|studio (portrait|shot))\b/i,
      /realistic .{0,20}(woman|man|girl|boy|person|human|alien|character) .{0,20}(standing|sitting|portrait|shot)/i,
      // CJK — no \b
      /人物摄影|人物照片|人物写真|人物特写|人物全身|人物半身|人像摄影|人像写真|角色立绘|角色形象|半身像|人物肖像|外星人肖像|人像转换|肖像转换|汉服人像|街头风角色|街头人像|情侣人像|酒吧人像/,
    ],
  },
  {
    name: 'photography',
    re: [
      /\b(photograph|photography|cinematic (shot|photo|still|frame)|product (photo|shot|photography)|aerial (photo|view)|street photo|still life|photorealistic|ultra[- ]?realistic (photo|image|shot)|documentary (photo|style)|candid (shot|photo)|editorial (photo|shot)|[0-9]+mm (film|photo|shot))\b/i,
      // CJK — no \b
      /摄影风格|摄影照片|摄影棚照片|摄影棚拍摄|实景照片|实景图像|胶片风格|胶片质感|胶片摄影|胶片感|电影感照片|电影感剧照|电影剧照|电影画面|电影镜头|写实风格|超写实照片|超写实图像|风景摄影|建筑摄影|风光摄影|毫米胶片|室内照片|剧照/,
    ],
  },
];

const KNOWN_CATEGORIES = new Set([
  'manga', 'advertising', 'game', 'portrait', 'photography',
  'poster', 'illustration', 'ui', 'infographic', 'logo', 'other',
]);

function classifyCategory(entry) {
  const text = [entry.title, entry.prompt].join(' ');
  for (const rule of CATEGORY_RULES) {
    for (const re of rule.re) {
      if (re.test(text)) return rule.name;
    }
  }
  return 'other';
}

// ── similarity helpers ────────────────────────────────────────────────────────

function wordSet(s) {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w一-鿿぀-ヿ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function similarity(a, b) {
  const sa = wordSet(a);
  const sb = wordSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((w) => { if (sb.has(w)) inter++; });
  return inter / Math.max(sa.size, sb.size);
}

function score(e) {
  return (e.stats.likes * 10) + (e.stats.views * 0.001) + e.prompt.length;
}

// ── main ─────────────────────────────────────────────────────────────────────

const raw = await readFile(FILE, 'utf-8');
const all = JSON.parse(raw);
console.log(`Loaded ${all.length} entries`);

// Step 1 — remove empty prompts
const noEmpty = all.filter((e) => e.prompt.trim().length > 0);
console.log(`After removing empty prompts: ${noEmpty.length} (removed ${all.length - noEmpty.length})`);

// Step 2 — deduplicate by thumbnail (same image file → keep highest score)
{
  const thumbMap = new Map();
  for (const e of noEmpty) {
    const prev = thumbMap.get(e.thumbnail);
    if (!prev || score(e) > score(prev)) thumbMap.set(e.thumbnail, e);
  }
  var deduped = Array.from(thumbMap.values());
  console.log(`After thumbnail dedup: ${deduped.length} (removed ${noEmpty.length - deduped.length})`);
}

// Step 3 — deduplicate by prompt similarity (>85% word overlap)
deduped.sort((a, b) => score(b) - score(a));
{
  const kept = [];
  for (const candidate of deduped) {
    const isDup = kept.some((k) => similarity(k.prompt, candidate.prompt) > 0.85);
    if (!isDup) kept.push(candidate);
  }
  var final = kept;
  console.log(`After similarity dedup: ${final.length} (removed ${deduped.length - final.length})`);
}

// Step 4 — reclassify.
// If a rule gives a specific category → use it (always overrides current).
// If no rule matches → keep the existing category as-is (avoids false demotions).
let reclassified = 0;
for (const e of final) {
  const oldCat = e.category;
  const ruled = classifyCategory(e);

  const newCat = ruled !== 'other' ? ruled : oldCat;

  if (newCat !== oldCat) {
    e.category = newCat;
    reclassified++;
  }

  // Sync tags: strip all category tags, re-add the single correct one
  e.tags = e.tags.filter((t) => !KNOWN_CATEGORIES.has(t));
  if (!e.tags.includes(e.category)) e.tags.push(e.category);
}
console.log(`Reclassified: ${reclassified} entries`);

// Step 5 — summary
const dist = {};
for (const e of final) dist[e.category] = (dist[e.category] || 0) + 1;
console.log('Final category distribution:');
Object.entries(dist)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`));

await writeFile(FILE, JSON.stringify(final, null, 2), 'utf-8');
console.log(`\nSaved ${final.length} entries → prompts.json`);
