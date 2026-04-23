'use client';

import { useState } from 'react';
import type { PromptEntry } from '@/lib/types';
import { withBasePath } from '@/lib/asset-path';

function cardGradient(id: string): string {
  const n = (parseInt(id.slice(-6), 16) % 360 + 360) % 360;
  return `linear-gradient(135deg, hsl(${n},60%,85%), hsl(${(n + 60) % 360},55%,70%))`;
}

interface Props {
  entry: PromptEntry;
  onClick: () => void;
  onTagClick: (tag: string) => void;
}

export default function PromptCard({ entry, onClick, onTagClick }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const displayTags = entry.tags.filter((t) => t !== entry.lang).slice(0, 3);
  const langLabel = entry.lang.toUpperCase();

  return (
    <div
      className="masonry-item group cursor-pointer select-none"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image container */}
      <div
        className="relative w-full rounded-2xl overflow-hidden transition-shadow duration-200"
        style={{
          boxShadow: hovered
            ? '0 8px 24px rgba(0,0,0,0.18)'
            : '0 2px 8px rgba(0,0,0,0.10)',
          background: imgFailed ? cardGradient(entry.id) : '#e5e5e5',
        }}
      >
        {!imgFailed && (
          <img
            src={withBasePath(entry.thumbnail)}
            alt={entry.title}
            className="w-full block object-cover transition-transform duration-300"
            style={{ transform: hovered ? 'scale(1.04)' : 'scale(1)' }}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}

        {imgFailed && (
          <div
            className="w-full flex items-center justify-center text-white/70 text-xs font-medium"
            style={{ aspectRatio: `1 / ${entry.thumbnailAspect}`, background: cardGradient(entry.id) }}
          >
            暂无图片
          </div>
        )}

        {/* Multiple images badge */}
        {entry.outputImages.length > 1 && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
            </svg>
            {entry.outputImages.length}
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
          style={{
            background: 'rgba(0,0,0,0.38)',
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <span
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            查看提示词
          </span>
        </div>
      </div>

      {/* Card metadata */}
      <div className="px-1 pt-2 pb-1">
        <p
          className="text-sm font-semibold leading-snug line-clamp-2 mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {entry.title}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            @{entry.author}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            {entry.stats.likes.toLocaleString()}
          </span>
        </div>

        {/* Tags + lang */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span
            className="tag-pill"
            style={{ background: '#111', color: '#fff', cursor: 'default' }}
            onClick={(e) => { e.stopPropagation(); onTagClick(entry.lang); }}
          >
            {langLabel}
          </span>
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="tag-pill"
              onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
