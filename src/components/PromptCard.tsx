'use client';

import { useState, useCallback } from 'react';
import type { PromptEntry } from '@/lib/types';
import { withBasePath } from '@/lib/asset-path';
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
  const [hovered, setHovered]       = useState(false);
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
    <div
      className="masonry-item cursor-pointer select-none"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative w-full rounded-2xl overflow-hidden transition-all duration-200"
        style={{
          boxShadow: hovered
            ? '0 12px 32px rgba(0,0,0,0.22)'
            : '0 2px 8px rgba(0,0,0,0.08)',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        }}
      >
        {/* ── Skeleton shimmer (shown while image loads) ── */}
        {!imgLoaded && !imgFailed && (
          <div
            className="skeleton w-full rounded-2xl"
            style={{ aspectRatio: `1 / ${entry.thumbnailAspect}` }}
          />
        )}

        {/* ── Image ── */}
        {!imgFailed && (
          <img
            src={withBasePath(entry.thumbnail)}
            alt={entry.title}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgFailed(true); setImgLoaded(true); }}
            className="w-full block object-cover transition-transform duration-300"
            style={{
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
              opacity: imgLoaded ? 1 : 0,
              // while loading, sit behind skeleton without taking layout space
              position: imgLoaded ? 'relative' : 'absolute',
              inset: imgLoaded ? 'auto' : 0,
            }}
          />
        )}

        {/* ── Fallback gradient ── */}
        {imgFailed && (
          <div
            className="w-full flex items-center justify-center text-white/60 text-xs font-medium"
            style={{ aspectRatio: `1 / ${entry.thumbnailAspect}`, background: cardGradient(entry.id) }}
          >
            {tx.noImage}
          </div>
        )}

        {/* ── Multiple images badge ── */}
        {entry.outputImages.length > 1 && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(0,0,0,0.50)', color: '#fff', backdropFilter: 'blur(4px)' }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 5h16v2H2zm0 6h16v2H2zm0 6h16v2H2z" />
            </svg>
            {entry.outputImages.length}
          </div>
        )}

        {/* ── Hover overlay ── */}
        <div
          className="absolute inset-0 flex items-end transition-opacity duration-200"
          style={{
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'auto' : 'none',
            background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.08) 55%, transparent 100%)',
          }}
        >
          {/* Bottom row: view label (centre) + quick-copy (right) */}
          <div className="w-full flex items-center justify-between px-3 pb-3">
            <span className="flex-1 text-center text-sm font-semibold text-white tracking-wide pl-7">
              {tx.viewPrompt}
            </span>

            {/* Quick-copy button */}
            <button
              onClick={handleQuickCopy}
              aria-label={tx.copyPrompt}
              className="flex items-center justify-center w-7 h-7 rounded-full transition-all active:scale-90 shrink-0"
              style={{ background: cardCopied ? '#16a34a' : 'rgba(255,255,255,0.20)', backdropFilter: 'blur(4px)' }}
            >
              {cardCopied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                  <rect width="12" height="12" x="9" y="9" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
