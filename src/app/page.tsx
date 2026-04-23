import type { PromptEntry } from '@/lib/types';
import rawData from '@/data/prompts.json';
import Gallery from '@/components/Gallery';
import Header from '@/components/Header';

export default function Home() {
  const entries = rawData as PromptEntry[];
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header total={entries.length} />
      <Gallery entries={entries} />
    </div>
  );
}
