'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function AuthModal() {
  const { authOpen, closeAuth, pendingPromptId, addSaved } = useAuth();
  const [tab, setTab]           = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [success, setSuccess]   = useState('');

  if (!authOpen) return null;

  const reset = (t: 'signin' | 'signup') => { setTab(t); setError(''); setSuccess(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const sb = getSupabase();

    if (tab === 'signin') {
      const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) { setError(err.message); setBusy(false); return; }
      if (pendingPromptId && data.user) {
        const { error: saveErr } = await sb.from('saved_prompts')
          .upsert({ user_id: data.user.id, prompt_id: pendingPromptId }, { onConflict: 'user_id,prompt_id' });
        if (!saveErr) addSaved(pendingPromptId);
      }
      closeAuth();
    } else {
      const { error: err } = await sb.auth.signUp({ email, password });
      if (err) { setError(err.message); setBusy(false); return; }
      setSuccess('Check your email to confirm your account, then sign in.');
    }
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
      onClick={closeAuth}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--card)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {pendingPromptId
              ? 'Sign in to save this prompt'
              : tab === 'signin' ? 'Sign in' : 'Create account'}
          </h2>
          <button
            onClick={closeAuth}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {(['signin', 'signup'] as const).map(t => (
            <button
              key={t}
              onClick={() => reset(t)}
              className="flex-1 py-2 text-sm font-medium transition-colors"
              style={{
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {success ? (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3">{success}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--text-primary)' }}
            />
            <input
              type="password"
              placeholder={tab === 'signup' ? 'Password (min. 6 characters)' : 'Password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--text-primary)' }}
            />
            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2.5 py-1.5">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {busy ? 'Loading…' : tab === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
