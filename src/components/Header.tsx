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
          <a
            href="https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors hover:bg-gray-50"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="hidden sm:inline">来源</span>
          </a>
        </div>
      </div>
    </header>
  );
}
