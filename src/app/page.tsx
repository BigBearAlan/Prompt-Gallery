import type { ImageQualityData, PromptEntry } from '@/lib/types';
import rawData from '@/data/prompts.json';
import imageQualityData from '@/data/image-quality.json';
import ClientRoot from '@/components/ClientRoot';

export default function Home() {
  const entries = (rawData as PromptEntry[]).filter(e => !e.pending);
  const imageQuality = imageQualityData as ImageQualityData;
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <ClientRoot entries={entries} imageQuality={imageQuality} />
    </div>
  );
}
