'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';

// 01b · Negative corner pixel-grid mark
// 3×3 grid, top-right cell removed, center cell is vermilion accent.
function PixWoMark({ size = 24, color = '#1a1714', accent = '#c8442a' }: {
  size?: number;
  color?: string;
  accent?: string;
}) {
  const cell = size / 3;
  const pad  = cell * 0.18;
  const s    = cell - pad * 2;
  const r    = s * 0.18;

  const pixels: { row: number; col: number; fill: string }[] = [
    { row: 0, col: 0, fill: color },
    { row: 0, col: 1, fill: color },
    // [0][2] missing — negative corner
    { row: 1, col: 0, fill: color },
    { row: 1, col: 1, fill: accent },
    { row: 1, col: 2, fill: color },
    { row: 2, col: 0, fill: color },
    { row: 2, col: 1, fill: color },
    { row: 2, col: 2, fill: color },
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {pixels.map(({ row, col, fill }) => (
        <rect
          key={`${row}-${col}`}
          x={col * cell + pad}
          y={row * cell + pad}
          width={s}
          height={s}
          rx={r}
          fill={fill}
        />
      ))}
    </svg>
  );
}

interface Props {
  compact?: boolean;
}

export default function Header({ compact = false }: Props) {
  const { locale, setLocale, tx } = useLocale();
  const { user, loading, openAuth, signOut } = useAuth();

  return (
    <header
      className={`sticky top-0 z-40 overflow-hidden transition-[max-height,opacity,border-color] duration-200 ${
        compact
          ? 'max-h-0 border-b-0 opacity-0 md:max-h-16 md:border-b md:opacity-100'
          : 'max-h-16 border-b opacity-100'
      }`}
      style={{
        background: 'rgba(246,243,236,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 min-w-0 select-none">
          <PixWoMark size={26} />
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            Pix<em style={{ fontWeight: 400 }}>Wo</em>
          </span>
          <span
            className="hidden sm:inline"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              letterSpacing: '0.08em',
              marginLeft: 2,
            }}
          >
            GALLERY
          </span>
        </Link>

        {/* Nav */}
        <div className="flex items-center gap-1.5 shrink-0">
          {user && (
            <Link
              href="/saved"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                background: '#fff',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              {locale === 'zh' ? '收藏' : 'Saved'}
            </Link>
          )}

          {!loading && (
            user ? (
              <button
                onClick={signOut}
                className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: '#fff' }}
              >
                {locale === 'zh' ? '退出' : 'Sign out'}
              </button>
            ) : (
              <button
                onClick={() => openAuth()}
                className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: '#fff' }}
              >
                {locale === 'zh' ? '登录' : 'Sign in'}
              </button>
            )
          )}

          <button
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--text-primary)',
              color: 'var(--bg)',
            }}
            aria-label="Switch language"
          >
            {tx.langToggle}
          </button>
        </div>

      </div>
    </header>
  );
}
