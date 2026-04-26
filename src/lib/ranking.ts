import type { ImageQualityData, PromptEntry } from './types';

const DEFAULT_SCORE = 50;

function finiteScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getPromptQualityScore(
  entry: PromptEntry,
  imageQuality?: ImageQualityData | null
): number | null {
  if (!imageQuality) return null;

  const scores: number[] = [];
  const entryScore = finiteScore(imageQuality.entries?.[entry.id]?.score);
  if (entryScore !== null) scores.push(entryScore);

  const images = [entry.thumbnail, ...(entry.outputImages || [])].filter(Boolean);
  for (const image of images) {
    const imageScore = finiteScore(imageQuality.images?.[image]?.score);
    if (imageScore !== null) scores.push(imageScore);
  }

  return scores.length ? Math.max(...scores) : null;
}

export function qualityWeight(entry: PromptEntry, imageQuality?: ImageQualityData | null): number {
  const score = getPromptQualityScore(entry, imageQuality) ?? DEFAULT_SCORE;
  const normalized = Math.max(0, Math.min(1, score / 100));
  const qualityBoost = Math.pow(normalized, 2.25) * 5.5;
  const hqBoost = entry.hq ? 1.1 : 0;
  return 0.45 + qualityBoost + hqBoost;
}

export function sessionNoise(id: string, seed: number): number {
  let hash = 2166136261;
  const value = `${seed}:${id}`;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function qualityAdjustedMetric(
  entry: PromptEntry,
  baseMetric: number,
  seed: number,
  imageQuality?: ImageQualityData | null
): number {
  const score = getPromptQualityScore(entry, imageQuality) ?? DEFAULT_SCORE;
  const qualityFactor = 0.72 + (score / 100) * 0.76;
  const jitter = 0.94 + sessionNoise(entry.id, seed) * 0.12;
  return baseMetric * qualityFactor * jitter + score * 8;
}
