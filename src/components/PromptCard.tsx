'use client';

import { useState, useCallback } from 'react';
import type { PromptEntry } from '@/lib/types';
import { useLocale } from '@/lib/i18n';

function cardGradient(id: string): string {
  const n = (parseInt(id.slice(-6), 16) % 360 + 360) % 360;
  return `linear-gradient(135deg, hsl(${n},60%,85%), hsl(${(n + 60) % 360},55%,70%))`;
}

interface Props {
  entry: PromptEntry;
  onClick: () => void;
}

export default function PromptCard({ entry, onClick }: Props) {
  const [imgFailed, setImgFailed]   = useState(false);
  const [imgLoaded, setImgLoaded]   = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const { tx } = useLocale();

  const handleQuickCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't open the modal
    try {
      await navigator.clipboard.writeText(entry.prompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = entry.prompt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCardCopied(true);
    setTimeout(() => setCardCopied(false), 2000);
  }, [entry.prompt]);

  return (
    <article
      className="masonry-item group cursor-zoom-in select-none"
      onClick={onClick}
    >
      <div
        className="relative w-full rounded-lg overflow-hidden bg-white border border-black/[0.04] transition-all duration-200 group-hover:border-black/[0.09]"
      >
        {!imgLoaded && !imgFailed && (
          <div
            className="skeleton w-full rounded-lg"
            style={{ aspectRatio: `1 / ${entry.thumbnailAspect}` }}
          />
        )}

        {!imgFailed && (
          <img
            src={entry.thumbnail}
            alt={entry.title}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgFailed(true); setImgLoaded(true); }}
            className="w-full block object-cover transition-transform duration-300 group-hover:scale-[1.015]"
            style={{
              opacity: imgLoaded ? 1 : 0,
              position: imgLoaded ? 'relative' : 'absolute',
              inset: imgLoaded ? 'auto' : 0,
            }}
          />
        )}

        {imgFailed && (
          <div
            className="w-full flex items-center justify-center text-white/60 text-xs font-medium"
            style={{ aspectRatio: `1 / ${entry.thumbnailAspect}`, background: cardGradient(entry.id) }}
          >
            {tx.noImage}
          </div>
        )}

        {entry.outputImages.length > 1 && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(0,0,0,0.42)', color: '#fff', backdropFilter: 'blur(8px)' }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 5h16v2H2zm0 6h16v2H2zm0 6h16v2H2z" />
            </svg>
            {entry.outputImages.length}
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.42), rgba(0,0,0,0.04) 58%, transparent)' }}
        />

        <div
          className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <span className="min-w-0 truncate text-xs font-medium text-white/95 drop-shadow">
            {entry.title}
          </span>

          <button
            onClick={handleQuickCopy}
            aria-label={tx.copyPrompt}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all active:scale-90 shrink-0"
            style={{ background: cardCopied ? '#16a34a' : 'rgba(255,255,255,0.92)', color: cardCopied ? '#fff' : '#111', backdropFilter: 'blur(8px)' }}
          >
            {cardCopied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect width="12" height="12" x="9" y="9" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
