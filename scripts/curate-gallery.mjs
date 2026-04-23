#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyCuration,
  detectCategory,
  ensureUniqueEntryIds,
  findDuplicateIdGroups,
  findDuplicatePromptGroups,
  loadCuration,
  loadJson,
  tagsWithCategory,
  truncate,
  VALID_CATEGORIES,
} from './gallery-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'prompts.json');
const CURATION_PATH = path.join(ROOT, 'src', 'data', 'curation.json');
const REPORT_PATH = path.join(ROOT, 'docs', 'gallery-audit.md');

function usage() {
  console.log(`
Prompt Gallery curation

Commands:
  audit                         Write duplicate/category review to docs/gallery-audit.md
  search <query>                Find prompt IDs by title, prompt, author, or URL
  dedupe                        Hide exact duplicate prompts, keeping the highest-liked item
  hide <id> [reason]            Hide one prompt from the gallery
  show <id>                     Unhide one prompt
  category <id> <category|auto> Set category override; valid: ${VALID_CATEGORIES.join(', ')}
  title <id> <title>            Set title override
  tag:add <id> <tag>            Add a tag override
  tag:remove <id> <tag>         Remove a tag override
  list                          Show current curation decisions
  apply                         Apply curation to the current src/data/prompts.json without fetching
  reclassify                    Re-detect every category, then apply curation

Examples:
  npm run curate -- audit
  npm run curate -- search "travel guide"
  npm run curate -- hide 2046378199681257920 "duplicate of 2046231542817497392"
  npm run curate -- category 2046231542817497392 infographic
  npm run curate -- reclassify
`);
}

async function loadData({ uniqueIds = false } = {}) {
  const data = await loadJson(DATA_PATH, []);
  if (!Array.isArray(data)) throw new Error(`${DATA_PATH} must contain an array.`);
  return uniqueIds ? ensureUniqueEntryIds(data).entries : data;
}

function sortCuration(curation) {
  return {
    version: curation.version || 1,
    entries: Object.fromEntries(
      Object.entries(curation.entries || {}).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

async function saveCuration(curation) {
  await writeFile(CURATION_PATH, `${JSON.stringify(sortCuration(curation), null, 2)}\n`, 'utf-8');
}

function findEntry(entries, id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error(`Could not find prompt id ${id} in ${DATA_PATH}`);
  return entry;
}

function editableEntry(curation, id) {
  curation.entries ||= {};
  curation.entries[id] ||= {};
  return curation.entries[id];
}

function categorySuggestion(entry) {
  return detectCategory(`${entry.title}\n${entry.prompt}`);
}

function sortByEngagement(entries) {
  return [...entries].sort((a, b) => {
    const likes = (b.stats?.likes || 0) - (a.stats?.likes || 0);
    if (likes) return likes;
    return (b.stats?.views || 0) - (a.stats?.views || 0);
  });
}

function escapeTable(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function commandFor(...parts) {
  return `npm run curate -- ${parts.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ')}`;
}

function addSuggestionTable(lines, suggestions, limit = 100) {
  lines.push('| Current | Suggested | ID | Title | Command |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const { entry, suggested } of suggestions.slice(0, limit)) {
    lines.push(
      `| ${entry.category} | ${suggested} | ${entry.id} | ${escapeTable(truncate(entry.title, 70))} | ` +
        `\`${commandFor('category', entry.id, suggested)}\` |`
    );
  }
  if (suggestions.length > limit) {
    lines.push('');
    lines.push(`Showing first ${limit} of ${suggestions.length} suggestions.`);
  }
}

async function audit() {
  const raw = await loadData();
  const duplicateIdGroups = findDuplicateIdGroups(raw);
  const { entries: uniqueRaw, stats: uniqueIdStats } = ensureUniqueEntryIds(raw);
  const curation = await loadCuration(CURATION_PATH);
  const { entries, stats } = applyCuration(uniqueRaw, curation);
  const duplicateGroups = findDuplicatePromptGroups(entries);
  const categoryCounts = entries.reduce((counts, entry) => {
    counts[entry.category] = (counts[entry.category] || 0) + 1;
    return counts;
  }, {});

  const suggestions = entries
    .map((entry) => ({ entry, suggested: categorySuggestion(entry) }))
    .filter(({ entry, suggested }) => {
      const override = curation.entries?.[entry.id];
      return suggested !== 'other' && suggested !== entry.category && !override?.category;
    })
    .sort((a, b) => a.entry.category.localeCompare(b.entry.category));
  const uncategorizedSuggestions = suggestions.filter(({ entry }) => entry.category === 'other');
  const possibleConflicts = suggestions.filter(({ entry }) => entry.category !== 'other');

  const lines = [];
  lines.push('# Gallery Audit');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Raw prompts: ${raw.length}`);
  lines.push(`After curation: ${entries.length}`);
  lines.push(`Duplicate ID groups: ${uniqueIdStats.duplicateIdGroups}; generated unique IDs: ${uniqueIdStats.idsChanged}.`);
  lines.push(
    `Applied curation: ${stats.hidden} hidden, ${stats.categoryOverrides} category overrides, ` +
      `${stats.titleOverrides} title overrides, ${stats.tagChanges} tag changes.`
  );
  lines.push('');
  lines.push('## Category Counts');
  lines.push('');
  for (const category of VALID_CATEGORIES) {
    lines.push(`- ${category}: ${categoryCounts[category] || 0}`);
  }

  lines.push('');
  lines.push('## Duplicate IDs');
  lines.push('');
  if (duplicateIdGroups.length === 0) {
    lines.push('No duplicate IDs found.');
  } else {
    lines.push(
      `Found ${duplicateIdGroups.length} ID group(s) where multiple cards share one source ID. ` +
        `Run \`${commandFor('apply')}\` to give those cards stable unique IDs for React keys and curation.`
    );
    lines.push('');
    for (const [id, group] of duplicateIdGroups.slice(0, 25)) {
      lines.push(`- ${id}: ${group.length} cards`);
    }
    if (duplicateIdGroups.length > 25) {
      lines.push('');
      lines.push(`Showing first 25 of ${duplicateIdGroups.length} duplicate ID groups.`);
    }
  }

  lines.push('');
  lines.push('## Duplicate Prompts');
  lines.push('');
  if (duplicateGroups.length === 0) {
    lines.push('No exact duplicate prompts after current curation.');
  } else {
    lines.push(`Found ${duplicateGroups.length} exact duplicate prompt group(s).`);
    lines.push('');
    for (const group of duplicateGroups.slice(0, 25)) {
      const sorted = sortByEngagement(group);
      const keep = sorted[0];
      lines.push(`### Keep ${keep.id}: ${escapeTable(keep.title)}`);
      lines.push('');
      lines.push(`Source: ${keep.sourceUrl}`);
      for (const duplicate of sorted.slice(1)) {
        lines.push(
          `- Hide ${duplicate.id}: ${escapeTable(duplicate.title)} ` +
            `(${commandFor('hide', duplicate.id, `duplicate of ${keep.id}`)})`
        );
      }
      lines.push('');
    }
  }

  lines.push('');
  lines.push('## Uncategorized Suggestions');
  lines.push('');
  if (uncategorizedSuggestions.length === 0) {
    lines.push('No uncategorized prompts found by the local heuristic.');
  } else {
    addSuggestionTable(lines, uncategorizedSuggestions, 100);
  }

  lines.push('');
  lines.push('## Possible Category Conflicts');
  lines.push('');
  lines.push('These are heuristic suggestions for prompts that already have a category. Review them more carefully.');
  lines.push('');
  if (possibleConflicts.length === 0) {
    lines.push('No possible category conflicts found by the local heuristic.');
  } else {
    addSuggestionTable(lines, possibleConflicts, 100);
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8');
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(
    `Duplicates: ${duplicateGroups.length}; uncategorized suggestions: ${uncategorizedSuggestions.length}; ` +
      `possible conflicts: ${possibleConflicts.length}`
  );
}

async function search(query) {
  if (!query) throw new Error('Search query is required.');
  const entries = await loadData({ uniqueIds: true });
  const q = query.toLowerCase();
  const matches = entries
    .filter((entry) =>
      [entry.id, entry.title, entry.prompt, entry.author, entry.sourceUrl]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    )
    .slice(0, 40);

  for (const entry of matches) {
    console.log(`${entry.id}  ${entry.category.padEnd(12)}  ${String(entry.stats?.likes || 0).padStart(5)} likes  ${entry.title}`);
  }
  console.log(`Shown ${matches.length} match(es).`);
}

async function dedupe() {
  const raw = await loadData({ uniqueIds: true });
  const curation = await loadCuration(CURATION_PATH);
  const { entries } = applyCuration(raw, curation);
  const duplicateGroups = findDuplicatePromptGroups(entries);
  let hidden = 0;

  for (const group of duplicateGroups) {
    const [keep, ...duplicates] = sortByEngagement(group);
    for (const duplicate of duplicates) {
      const override = editableEntry(curation, duplicate.id);
      override.hidden = true;
      override.reason = `Duplicate prompt; keep higher-engagement source ${keep.id}.`;
      hidden++;
    }
  }

  await saveCuration(curation);
  console.log(`Updated ${CURATION_PATH}. Hidden ${hidden} duplicate prompt(s).`);
}

async function hide(id, reason) {
  const entries = await loadData({ uniqueIds: true });
  findEntry(entries, id);
  const curation = await loadCuration(CURATION_PATH);
  const override = editableEntry(curation, id);
  override.hidden = true;
  if (reason) override.reason = reason;
  await saveCuration(curation);
  console.log(`Hidden ${id}.`);
}

async function show(id) {
  const curation = await loadCuration(CURATION_PATH);
  const override = editableEntry(curation, id);
  delete override.hidden;
  await saveCuration(curation);
  console.log(`Unhidden ${id}.`);
}

async function setCategory(id, category) {
  const entries = await loadData({ uniqueIds: true });
  const entry = findEntry(entries, id);
  const nextCategory = category === 'auto' ? categorySuggestion(entry) : category;
  if (!VALID_CATEGORIES.includes(nextCategory)) {
    throw new Error(`Invalid category "${category}". Use one of: ${VALID_CATEGORIES.join(', ')}, auto`);
  }

  const curation = await loadCuration(CURATION_PATH);
  const override = editableEntry(curation, id);
  override.category = nextCategory;
  await saveCuration(curation);
  console.log(`Set ${id} category to ${nextCategory}.`);
}

async function setTitle(id, title) {
  if (!title) throw new Error('Title is required.');
  const entries = await loadData({ uniqueIds: true });
  findEntry(entries, id);
  const curation = await loadCuration(CURATION_PATH);
  editableEntry(curation, id).title = title;
  await saveCuration(curation);
  console.log(`Set ${id} title override.`);
}

async function changeTag(id, tag, action) {
  if (!tag) throw new Error('Tag is required.');
  const entries = await loadData({ uniqueIds: true });
  const entry = findEntry(entries, id);
  const curation = await loadCuration(CURATION_PATH);
  const override = editableEntry(curation, id);
  const baseTags = override.tags || tagsWithCategory(entry.tags, entry.lang, override.category || entry.category);
  const tags = new Set(baseTags);
  if (action === 'add') tags.add(tag);
  if (action === 'remove') tags.delete(tag);
  override.tags = [...tags].slice(0, 8);
  delete override.addTags;
  delete override.removeTags;
  await saveCuration(curation);
  console.log(`${action === 'add' ? 'Added' : 'Removed'} tag ${tag} for ${id}.`);
}

async function listCuration() {
  const curation = await loadCuration(CURATION_PATH);
  const ids = Object.keys(curation.entries || {}).sort();
  if (ids.length === 0) {
    console.log('No curation decisions yet.');
    return;
  }

  for (const id of ids) {
    const override = curation.entries[id];
    const parts = [];
    if (override.hidden) parts.push('hidden');
    if (override.category) parts.push(`category=${override.category}`);
    if (override.title) parts.push(`title="${override.title}"`);
    if (override.tags) parts.push(`tags=${override.tags.join(',')}`);
    if (override.reason) parts.push(`reason="${override.reason}"`);
    console.log(`${id}: ${parts.join('; ')}`);
  }
}

async function applyToCurrentData() {
  const raw = await loadData();
  const { entries: uniqueRaw, stats: uniqueIdStats } = ensureUniqueEntryIds(raw);
  const curation = await loadCuration(CURATION_PATH);
  const { entries, stats } = applyCuration(uniqueRaw, curation);
  const sorted = entries.sort((a, b) => (b.stats?.likes || 0) - (a.stats?.likes || 0));
  await writeFile(DATA_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
  console.log(
    `Applied curation to ${DATA_PATH}: ${uniqueIdStats.idsChanged} IDs made unique, ${stats.hidden} hidden, ` +
      `${stats.categoryOverrides} category overrides, ${stats.titleOverrides} title overrides, ${stats.tagChanges} tag changes.`
  );
}

async function reclassifyAll() {
  const raw = await loadData();
  const { entries: uniqueRaw, stats: uniqueIdStats } = ensureUniqueEntryIds(raw);
  const curation = await loadCuration(CURATION_PATH);
  let categoryChanges = 0;
  let tagChanges = 0;

  const classified = uniqueRaw.map((entry) => {
    const category = detectCategory(`${entry.title}\n${entry.prompt}`);
    const tags = tagsWithCategory(entry.tags, entry.lang, category);

    if (category !== entry.category) categoryChanges++;
    if (JSON.stringify(tags) !== JSON.stringify(entry.tags || [])) tagChanges++;

    return {
      ...entry,
      category,
      tags,
      stats: { ...(entry.stats || {}) },
      outputImages: [...(entry.outputImages || [])],
    };
  });

  const { entries, stats } = applyCuration(classified, curation);
  const sorted = entries.sort((a, b) => (b.stats?.likes || 0) - (a.stats?.likes || 0));
  await writeFile(DATA_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
  console.log(
    `Reclassified ${DATA_PATH}: ${uniqueIdStats.idsChanged} IDs made unique, ` +
      `${categoryChanges} category changes, ${tagChanges} tag refreshes, ${stats.hidden} hidden by curation.`
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    case 'audit':
      await audit();
      break;
    case 'search':
      await search(args.join(' '));
      break;
    case 'dedupe':
      await dedupe();
      break;
    case 'hide':
      await hide(args[0], args.slice(1).join(' '));
      break;
    case 'show':
      await show(args[0]);
      break;
    case 'category':
      await setCategory(args[0], args[1]);
      break;
    case 'title':
      await setTitle(args[0], args.slice(1).join(' '));
      break;
    case 'tag:add':
      await changeTag(args[0], args[1], 'add');
      break;
    case 'tag:remove':
      await changeTag(args[0], args[1], 'remove');
      break;
    case 'list':
      await listCuration();
      break;
    case 'apply':
      await applyToCurrentData();
      break;
    case 'reclassify':
      await reclassifyAll();
      break;
    default:
      throw new Error(`Unknown command "${command}". Run: npm run curate -- help`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
