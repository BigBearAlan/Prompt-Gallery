import type { PromptEntry } from '@/lib/types';
import rawData from '@/data/prompts.json';
import ClientRoot from '@/components/ClientRoot';

export default function Home() {
  const entries = (rawData as PromptEntry[]).filter(e => !e.pending);
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <ClientRoot entries={entries} />
    </div>
  );
}
