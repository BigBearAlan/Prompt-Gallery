'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PromptEntry } from '@/lib/types';
import { withBasePath } from '@/lib/asset-path';
import { useLocale } from '@/lib/i18n';

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface Props {
  entry: PromptEntry;
  onClose: () => void;
  onTagClick: (tag: string) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function PromptModal({ entry, onClose, onTagClick, hasPrev, hasNext, onPrev, onNext }: Props) {
  const [editedPrompt, setEditedPrompt] = useState(entry.prompt);
  const [copied, setCopied] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [mobileTab, setMobileTab] = useState<'image' | 'prompt'>('image');
  const { tx } = useLocale();

  useEffect(() => {
    setEditedPrompt(entry.prompt);
    setActiveImage(0);
    setImgFailed(false);
    setMobileTab('image');
  }, [entry]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Arrow nav — skip when user is typing in the textarea
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft'  && hasPrev && onPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedPrompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = editedPrompt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editedPrompt]);

  const handleReset = useCallback(() => setEditedPrompt(entry.prompt), [entry.prompt]);
  const hasEdits = editedPrompt !== entry.prompt;

  const NavBtn = ({ dir }: { dir: 'prev' | 'next' }) => {
    const active = dir === 'prev' ? hasPrev : hasNext;
    const handle = dir === 'prev' ? onPrev   : onNext;
    const label  = dir === 'prev' ? tx.prevEntry : tx.nextEntry;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handle?.(); }}
        aria-label={label}
        className="fixed top-1/2 -translate-y-1/2 z-[51] flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 active:scale-90"
        style={{
          [dir === 'prev' ? 'left' : 'right']: '12px',
          background: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.25)',
          boxShadow: active ? '0 2px 12px rgba(0,0,0,0.18)' : 'none',
          opacity: active ? 1 : 0.35,
          cursor: active ? 'pointer' : 'default',
          pointerEvents: active ? 'auto' : 'none',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round">
          {dir === 'prev'
            ? <polyline points="15 18 9 12 15 6" />
            : <polyline points="9 18 15 12 9 6" />}
        </svg>
      </button>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <NavBtn dir="prev" />
      <NavBtn dir="next" />

      <div
        className="modal-content w-full max-w-4xl max-h-[92vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal header ─────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0"
              style={{ background: '#f0f0f0', color: 'var(--text-secondary)' }}
            >
              {tx.catLabels[entry.category] ?? entry.category}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              @{entry.author}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors ml-2 shrink-0"
            aria-label={tx.close}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Mobile tab bar ───────────────────────────────── */}
        <div
          className="flex md:hidden shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={() => setMobileTab('image')}
            className="flex-1 py-2.5 text-sm font-medium transition-colors relative"
            style={{ color: mobileTab === 'image' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {tx.tabImage}
            {mobileTab === 'image' && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full" style={{ background: 'var(--text-primary)' }} />
            )}
          </button>
          <button
            onClick={() => setMobileTab('prompt')}
            className="flex-1 py-2.5 text-sm font-medium transition-colors relative"
            style={{ color: mobileTab === 'prompt' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {tx.tabPrompt}
            {mobileTab === 'prompt' && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full" style={{ background: 'var(--text-primary)' }} />
            )}
          </button>
        </div>

        {/* ── Modal body ───────────────────────────────────── */}
        <div className="flex flex-col md:flex-row overflow-hidden flex-1 min-h-0">

          {/* Left: image panel */}
          <div
            className={`${mobileTab === 'prompt' ? 'hidden' : 'flex'} md:flex md:w-[45%] shrink-0 flex-col p-4 gap-3 overflow-y-auto scrollbar-none border-b md:border-b-0 md:border-r`}
            style={{ borderColor: 'var(--border)', background: '#f8f8f8' }}
          >
            <div className="w-full rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
              {!imgFailed ? (
                <img
                  key={entry.outputImages[activeImage]}
                  src={withBasePath(entry.outputImages[activeImage] || entry.thumbnail)}
                  alt={entry.title}
                  className="w-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center text-gray-400 text-sm">
                  {tx.imageUnavailable}
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {entry.outputImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {entry.outputImages.map((url, i) => (
                  <button
                    key={url}
                    onClick={() => { setActiveImage(i); setImgFailed(false); }}
                    className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                      i === activeImage ? 'border-gray-900' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={withBasePath(url)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {formatNum(entry.stats.likes)}
              </span>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {formatNum(entry.stats.views)}
              </span>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 7 16 12 23 17V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                {formatNum(entry.stats.retweets)}
              </span>
            </div>
          </div>

          {/* Right: prompt panel */}
          <div
            className={`${mobileTab === 'image' ? 'hidden' : 'flex'} md:flex flex-1 flex-col min-h-0 overflow-y-auto`}
          >
            <div className="p-4 md:p-5 flex flex-col gap-4 flex-1">
              {/* Title */}
              <div>
                <h2 className="text-base font-bold leading-snug mb-2" style={{ color: 'var(--text-primary)' }}>
                  {entry.title}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className="tag-pill cursor-pointer"
                    style={{ background: '#111', color: '#fff' }}
                    onClick={() => { onTagClick(entry.lang); onClose(); }}
                  >
                    {entry.lang.toUpperCase()}
                  </span>
                  {entry.tags
                    .filter((t) => t !== entry.lang)
                    .map((tag) => (
                      <span
                        key={tag}
                        className="tag-pill cursor-pointer"
                        onClick={() => { onTagClick(tag); onClose(); }}
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </div>

              <div className="border-t" style={{ borderColor: 'var(--border)' }} />

              {/* Prompt editor */}
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    {tx.promptTemplate}
                  </span>
                  {hasEdits && (
                    <button
                      onClick={handleReset}
                      className="text-xs underline underline-offset-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {tx.reset}
                    </button>
                  )}
                </div>

                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {tx.promptHint}
                </p>

                <textarea
                  className="prompt-textarea w-full flex-1 min-h-[160px] p-3 rounded-xl border outline-none focus:ring-2 focus:ring-gray-900/20 transition"
                  style={{
                    borderColor: hasEdits ? '#999' : 'var(--border)',
                    background: '#fafafa',
                    color: 'var(--text-primary)',
                  }}
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  spellCheck={false}
                />

                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>{tx.chars(editedPrompt.length)}</span>
                  {hasEdits && <span className="italic">{tx.edited}</span>}
                </div>
              </div>
            </div>

            {/* Sticky action bar */}
            <div
              className="px-4 md:px-5 py-3 border-t flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                style={{ background: copied ? '#16a34a' : 'var(--accent)' }}
              >
                {copied ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {tx.copied}
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                    {tx.copyPrompt}
                  </>
                )}
              </button>

              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {tx.source}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" x2="21" y1="14" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
