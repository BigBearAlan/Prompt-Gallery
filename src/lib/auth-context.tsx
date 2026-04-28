'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  savedIds: Set<string>;
  toggleSave: (promptId: string) => Promise<void>;
  openAuth: (pendingPromptId?: string) => void;
  closeAuth: () => void;
  authOpen: boolean;
  pendingPromptId: string | null;
  signOut: () => Promise<void>;
  addSaved: (promptId: string) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);
  const [savedIds, setSavedIds]       = useState<Set<string>>(new Set());
  const [authOpen, setAuthOpen]       = useState(false);
  const [pendingPromptId, setPending] = useState<string | null>(null);

  const loadSaved = useCallback(async (userId: string) => {
    const { data } = await getSupabase()
      .from('saved_prompts')
      .select('prompt_id')
      .eq('user_id', userId);
    if (data) setSavedIds(new Set(data.map((r: { prompt_id: string }) => r.prompt_id)));
  }, []);

  useEffect(() => {
    const sb = getSupabase();

    sb.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadSaved(u.id);
      setLoading(false);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadSaved(u.id);
      else setSavedIds(new Set());
    });

    return () => subscription.unsubscribe();
  }, [loadSaved]);

  const openAuth = useCallback((pendingId?: string) => {
    setPending(pendingId ?? null);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    setPending(null);
  }, []);

  const toggleSave = useCallback(async (promptId: string) => {
    if (!user) { openAuth(promptId); return; }

    const sb = getSupabase();
    if (savedIds.has(promptId)) {
      setSavedIds(prev => { const s = new Set(prev); s.delete(promptId); return s; });
      await sb.from('saved_prompts').delete()
        .eq('user_id', user.id).eq('prompt_id', promptId);
    } else {
      setSavedIds(prev => new Set([...prev, promptId]));
      await sb.from('saved_prompts').insert({ user_id: user.id, prompt_id: promptId });
    }
  }, [user, savedIds, openAuth]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setSavedIds(new Set());
  }, []);

  const addSaved = useCallback((promptId: string) => {
    setSavedIds(prev => new Set([...prev, promptId]));
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, savedIds, toggleSave, openAuth, closeAuth, authOpen, pendingPromptId, signOut, addSaved }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
