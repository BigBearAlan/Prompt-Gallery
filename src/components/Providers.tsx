'use client';

import { AuthProvider } from '@/lib/auth-context';
import { LocaleProvider } from '@/lib/i18n';
import AuthModal from './AuthModal';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AuthProvider>
        {children}
        <AuthModal />
      </AuthProvider>
    </LocaleProvider>
  );
}
