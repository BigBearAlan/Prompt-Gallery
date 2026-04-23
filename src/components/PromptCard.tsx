'use client';

import { useState } from 'react';
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
  const [imgFailed, setImgFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { tx } = useLocale();

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
        {!imgFailed ? (
          <img
            src={withBasePath(entry.thumbnail)}
            alt={entry.title}
            className="w-full block object-cover transition-transform duration-300"
            style={{ transform: hovered ? 'scale(1.04)' : 'scale(1)' }}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="w-full flex items-center justify-center text-white/60 text-xs font-medium"
            style={{ aspectRatio: `1 / ${entry.thumbnailAspect}`, background: cardGradient(entry.id) }}
          >
            {tx.noImage}
          </div>
        )}

        {/* Multiple images badge */}
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

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-end justify-stretch transition-opacity duration-200"
          style={{
            opacity: hovered ? 1 : 0,
            pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.08) 55%, transparent 100%)',
          }}
        >
          <span className="w-full text-center text-sm font-semibold text-white pb-3 tracking-wide">
            {tx.viewPrompt}
          </span>
        </div>
      </div>
    </div>
  );
}
