import rawData from '@/data/prompts.json';
import type { PromptEntry } from '@/lib/types';
import SavedClient from './SavedClient';

export default function SavedPage() {
  const entries = (rawData as PromptEntry[]).filter(e => !e.pending);
  return <SavedClient entries={entries} />;
}
