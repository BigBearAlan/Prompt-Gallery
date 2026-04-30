import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'PixWo — Archive of Generative Imagery',
  description:
    'A curated archive of AI image prompts. Browse, save, edit and copy prompts for GPT Image, Midjourney, and more.',
  icons: {
    icon: '/brand/prompt-gallery-logo.png',
    apple: '/brand/prompt-gallery-logo.png',
  },
  openGraph: {
    title: 'PixWo',
    description: 'An archive of generative imagery & prompts.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
