'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { PromptEntry } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Header from '@/components/Header';
import PromptCard from '@/components/PromptCard';
import PromptModal from '@/components/PromptModal';

interface MasonryCard { entry: PromptEntry; index: number; }

function columnCountForWidth(w: number) {
  if (w < 360) return 1;
  if (w < 640) return 2;
  if (w < 1024) return 3;
  if (w < 1440) return 4;
  return 5;
}

function buildColumns(items: PromptEntry[], count: number) {
  const cols = Array.from({ length: count }, () => ({ height: 0, items: [] as MasonryCard[] }));
  items.forEach((entry, index) => {
    let shortest = 0;
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].height < cols[shortest].height) shortest = i;
    }
    const aspect = Number.isFinite(entry.thumbnailAspect) && entry.thumbnailAspect > 0 ? entry.thumbnailAspect : 1.25;
    cols[shortest].height += aspect;
    cols[shortest].items.push({ entry, index });
  });
  return cols;
}

interface Props { entries: PromptEntry[]; }

export default function SavedClient({ entries }: Props) {
  const { user, savedIds, loading, openAuth } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [colCount, setColCount] = useState(2);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      setColCount(columnCountForWidth(node.clientWidth || window.innerWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const savedEntries = useMemo(
    () => entries.filter(e => savedIds.has(e.id)),
    [entries, savedIds],
  );

  const columns = useMemo(
    () => buildColumns(savedEntries, colCount),
    [savedEntries, colCount],
  );

  const selectedEntry = selected !== null ? savedEntries[selected] : null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header />

      <main className="max-w-[1800px] mx-auto px-4 sm:px-5 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Saved
          </h1>
          {user && savedEntries.length > 0 && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: '#f0f0f0', color: 'var(--text-secondary)' }}
            >
              {savedEntries.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading…
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)' }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Sign in to see your saved prompts.
            </p>
            <button
              onClick={() => openAuth()}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all active:scale-95"
              style={{ background: 'var(--accent)' }}
            >
              Sign in
            </button>
          </div>
        ) : savedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)' }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No saved prompts yet.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Click the bookmark icon on any prompt to save it here.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="masonry-grid"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {columns.map((col, ci) => (
              <div key={ci} className="masonry-column">
                {col.items.map(({ entry, index }) => (
                  <PromptCard
                    key={entry.id}
                    entry={entry}
                    onClick={() => setSelected(index)}
                    loading={index < 12 ? 'eager' : 'lazy'}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedEntry && (
        <PromptModal
          entry={selectedEntry}
          onClose={() => setSelected(null)}
          onTagClick={() => {}}
          hasPrev={selected! > 0}
          hasNext={selected! < savedEntries.length - 1}
          onPrev={() => setSelected(v => (v ?? 1) - 1)}
          onNext={() => setSelected(v => (v ?? 0) + 1)}
        />
      )}
    </div>
  );
}
