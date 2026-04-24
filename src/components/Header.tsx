'use client';

import { useLocale } from '@/lib/i18n';

interface HeaderProps {
  total: number;
}

export default function Header({ total }: HeaderProps) {
  const { locale, setLocale, tx } = useLocale();

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 leading-none">
              <span className="font-bold text-[15px] tracking-tight whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                Prompt Gallery
              </span>
              <span
                className="text-[15px] font-bold tracking-tight whitespace-nowrap"
                style={{ color: 'var(--text-primary)' }}
              >
                AI生图提示词
              </span>
            </div>
            <p className="hidden sm:block text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
              {tx.tagline}
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="sm:hidden text-xs" style={{ color: 'var(--text-secondary)' }}>
            {total.toLocaleString()}
          </span>

          {/* Language toggle */}
          <button
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors hover:bg-gray-100"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
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
