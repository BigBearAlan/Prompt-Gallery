import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prompt Gallery — Curated AI Image Prompts',
  description:
    'A curated collection of reusable AI image generation prompts. Browse, filter, edit, and copy prompts for GPT Image, Midjourney, and more.',
  openGraph: {
    title: 'Prompt Gallery',
    description: 'Curated AI image generation prompts — browse, edit, and copy.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
