interface HeaderProps {
  total: number;
}

export default function Header({ total }: HeaderProps) {
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
                PromptCanvas
              </span>
              <span
                className="hidden sm:inline text-[11px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide"
                style={{ background: '#f0f0f0', color: 'var(--text-secondary)' }}
              >
                图社
              </span>
            </div>
            <p className="hidden sm:block text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
              {total.toLocaleString()} 个 AI 图像提示词
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="sm:hidden text-xs" style={{ color: 'var(--text-secondary)' }}>
            {total.toLocaleString()} 个
          </span>
        </div>
      </div>
    </header>
  );
}
