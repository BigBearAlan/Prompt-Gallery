'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PromptEntry } from '@/lib/types';
import { useLocale } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';

interface Props {
  entry: PromptEntry;
  onClose: () => void;
  onTagClick: (tag: string) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

// Read-only prompt display with [VARIABLE] highlighted in vermilion.
function HighlightedPrompt({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, i) =>
        /^\[[^\]]+\]$/.test(part)
          ? <span key={i} style={{ color: '#c8442a', fontWeight: 500 }}>{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

export default function PromptModal({
  entry, onClose, onTagClick, hasPrev, hasNext, onPrev, onNext,
}: Props) {
  const [editedPrompt, setEditedPrompt] = useState(entry.prompt);
  const [editMode, setEditMode]         = useState(false);
  const [copied, setCopied]             = useState(false);
  const [activeImage, setActiveImage]   = useState(0);
  const [imgFailed, setImgFailed]       = useState(false);
  const [mobileTab, setMobileTab]       = useState<'image' | 'prompt'>('image');
  const { tx, locale }                  = useLocale();
  const { savedIds, toggleSave }        = useAuth();
  const isSaved = savedIds.has(entry.id);
  const isZh    = locale === 'zh';

  useEffect(() => {
    setEditedPrompt(entry.prompt);
    setActiveImage(0);
    setImgFailed(false);
    setEditMode(false);
    setMobileTab('image');
  }, [entry]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
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
    setTimeout(() => setCopied(false), 2200);
  }, [editedPrompt]);

  const hasEdits    = editedPrompt !== entry.prompt;
  const catLabel    = tx.catLabels[entry.category] ?? entry.category;
  const createdDate = (() => {
    try {
      return new Date(entry.createdAt).toLocaleDateString(
        isZh ? 'zh-CN' : 'en-US',
        { month: 'short', day: 'numeric', year: 'numeric' },
      );
    } catch { return '—'; }
  })();

  const meta = isZh
    ? [['模型', 'GPT Image'], ['创建于', createdDate], ['收藏数', entry.stats.likes.toLocaleString()]]
    : [['Model', 'GPT Image'], ['Created', createdDate], ['Saved', entry.stats.likes.toLocaleString()]];

  const saveLabel = isZh
    ? (isSaved ? '已收藏' : '收藏')
    : (isSaved ? 'Saved' : 'Save');

  return (
    <div className="modal-backdrop" onClick={onClose}>

      {/* Prev / Next arrows */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          className="fixed z-[51] flex items-center justify-center"
          style={arrowStyle('left')}
          aria-label={tx.prevEntry}
        >‹</button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          className="fixed z-[51] flex items-center justify-center"
          style={arrowStyle('right')}
          aria-label={tx.nextEntry}
        >›</button>
      )}

      {/* Modal shell */}
      <div
        className="modal-content w-full flex flex-col md:grid"
        style={{
          maxWidth: 1080,
          maxHeight: '92vh',
          background: '#f6f3ec',
          border: '1px solid rgba(26,23,20,0.1)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
          gridTemplateColumns: '1fr 1fr',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: isZh
            ? '"Noto Sans SC", "PingFang SC", Inter, sans-serif'
            : 'Inter, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Top header strip (spans both columns on desktop) ── */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 46,
            padding: '0 16px',
            borderBottom: '1px solid rgba(26,23,20,0.1)',
            background: '#f6f3ec',
            zIndex: 2,
          }}
        >
          <div className="flex items-center gap-2.5">
            <span style={{
              padding: '4px 10px', borderRadius: 99,
              background: '#1a1714', color: '#f6f3ec',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em',
            }}>
              {catLabel.toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: '#5a5450' }}>@{entry.author}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 20, color: '#1a1714',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label={tx.close}
          >×</button>
        </div>

        {/* ── Mobile tab bar ── */}
        <div
          className="flex md:hidden shrink-0"
          style={{
            marginTop: 46,
            borderBottom: '1px solid rgba(26,23,20,0.1)',
          }}
        >
          {(['image', 'prompt'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className="flex-1 py-2.5 text-sm font-medium transition-colors relative"
              style={{
                color: mobileTab === tab ? '#1a1714' : '#8a8278',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {tab === 'image' ? tx.tabImage : tx.tabPrompt}
              {mobileTab === tab && (
                <span
                  className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                  style={{ background: '#1a1714' }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── LEFT — dark image panel ── */}
        <div
          className={`${mobileTab === 'prompt' ? 'hidden' : 'flex'} md:flex flex-col items-center justify-center gap-3`}
          style={{
            background: '#0c0b0a',
            padding: '62px 20px 20px',
            paddingTop: 'max(62px, calc(46px + 16px))',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Main image */}
          <div style={{ width: '100%', maxWidth: 460 }}>
            {!imgFailed ? (
              <img
                key={entry.outputImages[activeImage]}
                src={entry.outputImages[activeImage] || entry.thumbnail}
                alt={entry.title}
                style={{
                  width: '100%', display: 'block',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                }}
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div style={{
                width: '100%', aspectRatio: '4/3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.3)', fontSize: 13,
                background: 'rgba(255,255,255,0.04)',
              }}>
                {tx.imageUnavailable}
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {entry.outputImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto" style={{ width: '100%', maxWidth: 460 }}>
              {entry.outputImages.map((url, i) => (
                <button
                  key={url}
                  onClick={() => { setActiveImage(i); setImgFailed(false); }}
                  style={{
                    flexShrink: 0, width: 48, height: 48, padding: 0,
                    border: `2px solid ${i === activeImage ? '#c8442a' : 'rgba(255,255,255,0.12)'}`,
                    background: 'none', cursor: 'pointer', overflow: 'hidden',
                    opacity: i === activeImage ? 1 : 0.55,
                    transition: 'opacity 0.15s, border-color 0.15s',
                  }}
                >
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT — cream content panel ── */}
        <div
          className={`${mobileTab === 'image' ? 'hidden' : 'flex'} md:flex flex-col`}
          style={{
            background: '#f6f3ec',
            overflowY: 'auto',
            paddingTop: 46,
            minHeight: 0,
          }}
        >
          {/* Title + tags */}
          <div style={{ padding: '20px 28px 16px' }}>
            <h2 style={{
              fontFamily: isZh ? '"Noto Serif SC", serif' : 'var(--serif)',
              fontSize: isZh ? 19 : 21, fontWeight: 500, lineHeight: 1.3,
              margin: 0, color: '#1a1714', letterSpacing: '-0.01em',
            }}>
              {entry.title}
            </h2>
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
              <span style={{
                padding: '4px 12px', borderRadius: 99, fontSize: 11,
                background: '#1a1714', color: '#f6f3ec',
              }}>
                {entry.lang.toUpperCase()}
              </span>
              {entry.tags.filter(t => t !== entry.lang).map(tag => (
                <span
                  key={tag}
                  onClick={() => { onTagClick(tag); onClose(); }}
                  style={{
                    padding: '4px 12px', borderRadius: 99, fontSize: 11,
                    background: 'transparent', color: '#1a1714',
                    border: '1px solid rgba(26,23,20,0.18)', cursor: 'pointer',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div style={{ margin: '0 28px', borderTop: '1px solid rgba(26,23,20,0.1)' }} />

          {/* Prompt section */}
          <div style={{
            padding: '14px 28px 10px',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Prompt header */}
            <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                color: '#8a8278', letterSpacing: '0.14em',
              }}>
                {tx.promptTemplate.toUpperCase()}
              </span>
              <div className="flex items-center gap-2">
                {editMode && hasEdits && (
                  <button
                    onClick={() => setEditedPrompt(entry.prompt)}
                    style={{
                      fontSize: 11, color: '#8a8278', background: 'none',
                      border: 'none', cursor: 'pointer', textDecoration: 'underline',
                      fontFamily: 'inherit',
                    }}
                  >
                    {tx.reset}
                  </button>
                )}
                <button
                  onClick={() => setEditMode(m => !m)}
                  style={{
                    fontSize: 11, padding: '2px 10px',
                    borderRadius: 4, cursor: 'pointer',
                    background: editMode ? '#1a1714' : 'transparent',
                    color: editMode ? '#f6f3ec' : '#8a8278',
                    border: '1px solid rgba(26,23,20,0.2)',
                    fontFamily: 'var(--mono)',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {editMode ? (isZh ? '完成' : 'Done') : (isZh ? '编辑' : 'Edit')}
                </button>
              </div>
            </div>

            {/* Prompt display / edit */}
            <div style={{
              minHeight: 160, maxHeight: 340, overflowY: 'auto',
              background: '#fbf9f3',
              border: '1px solid rgba(26,23,20,0.08)',
              borderRadius: 3,
            }}>
              {editMode ? (
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: '100%', minHeight: 160,
                    border: 'none', outline: 'none', resize: 'vertical',
                    background: 'transparent',
                    padding: '14px 16px',
                    fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.65,
                    color: '#2a251f',
                  }}
                />
              ) : (
                <div style={{
                  padding: '14px 16px',
                  fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.65,
                  color: '#2a251f', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  <HighlightedPrompt text={editedPrompt} />
                </div>
              )}
            </div>

            {/* Char count */}
            <div style={{
              fontSize: 11, color: '#8a8278',
              marginTop: 6, textAlign: 'right',
            }}>
              {tx.chars(editedPrompt.length)}
              {hasEdits && (
                <span style={{ marginLeft: 8, fontStyle: 'italic' }}>{tx.edited}</span>
              )}
            </div>
          </div>

          {/* Meta strip */}
          <div style={{ padding: '4px 28px 10px', display: 'flex', gap: 20 }}>
            {meta.map(([k, v]) => (
              <div key={k}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 9,
                  color: '#8a8278', letterSpacing: '0.1em',
                }}>
                  {k.toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: '#1a1714', marginTop: 2, fontWeight: 500 }}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          {/* Action bar */}
          <div style={{
            padding: '12px 28px 20px',
            display: 'flex', gap: 8,
            borderTop: '1px solid rgba(26,23,20,0.08)',
          }}>
            {/* Copy */}
            <button
              onClick={handleCopy}
              style={{
                flex: 1, padding: '12px 16px',
                background: copied ? '#16a34a' : '#1a1714',
                color: '#f6f3ec', border: 'none',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'background 0.2s',
              }}
            >
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  {tx.copied}
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="12" height="12" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {tx.copyPrompt}
                </>
              )}
            </button>

            {/* Save */}
            <button
              onClick={() => toggleSave(entry.id)}
              style={{
                padding: '12px 14px', borderRadius: 3, cursor: 'pointer',
                background: isSaved ? '#fff0ee' : '#fff',
                color: '#1a1714',
                border: `1px solid ${isSaved ? '#c8442a' : 'rgba(26,23,20,0.18)'}`,
                fontFamily: 'inherit', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ color: '#c8442a', fontSize: 14 }}>{isSaved ? '♥' : '♡'}</span>
              {saveLabel}
            </button>

            {/* Source */}
            {entry.sourceUrl && (
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '12px 14px', borderRadius: 3, cursor: 'pointer',
                  background: '#fff', color: '#1a1714',
                  border: '1px solid rgba(26,23,20,0.18)',
                  fontFamily: 'inherit', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 5,
                  textDecoration: 'none',
                }}
              >
                {tx.source}
                <span style={{ fontSize: 11, opacity: 0.55 }}>↗</span>
              </a>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
  top: '50%',
  transform: 'translateY(-50%)',
  [side]: 14,
  width: 44, height: 44, borderRadius: 99,
  background: 'rgba(246,243,236,0.96)',
  color: '#1a1714',
  border: '1px solid rgba(26,23,20,0.12)',
  fontFamily: 'Georgia, serif',
  fontSize: 26, lineHeight: 1,
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
  userSelect: 'none',
});
