'use client';

import type { PromptEntry } from '@/lib/types';
import { LocaleProvider } from '@/lib/i18n';
import Header from './Header';
import Gallery from './Gallery';

export default function ClientRoot({ entries }: { entries: PromptEntry[] }) {
  return (
    <LocaleProvider>
      <Header />
      <Gallery entries={entries} />
    </LocaleProvider>
  );
}
