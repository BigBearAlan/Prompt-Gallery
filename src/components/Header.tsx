'use client';

import { useLocale } from '@/lib/i18n';

interface Props {
  compact?: boolean;
}

export default function Header({ compact = false }: Props) {
  const { locale, setLocale, tx } = useLocale();

  return (
    <header
      className={`sticky top-0 z-40 overflow-hidden backdrop-blur-xl transition-[max-height,opacity,border-color] duration-200 ${
        compact
          ? 'max-h-0 border-b-0 opacity-0 md:max-h-16 md:border-b md:opacity-100'
          : 'max-h-16 border-b opacity-100'
      }`}
      style={{
        background: 'rgba(255,255,255,0.88)',
        borderColor: compact ? 'transparent' : 'var(--border)',
      }}
    >
      <div className="max-w-[1800px] mx-auto px-4 sm:px-5 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/brand/prompt-gallery-logo.png"
            alt=""
            className="w-10 h-10 rounded-lg object-cover shrink-0"
            width={40}
            height={40}
          />
          <span className="font-semibold text-[15px] sm:text-base tracking-tight whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
            Prompt Gallery
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: '#fff' }}
            aria-label="Switch language"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            {tx.langToggle}
          </button>
        </div>
      </div>
    </header>
  );
}
