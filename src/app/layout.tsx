import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prompt Gallery — AI 图像提示词精选',
  description:
    '精选 1000+ AI 图像生成提示词合集，支持浏览、筛选、编辑和一键复制，适用于 GPT Image、Midjourney 等工具。',
  openGraph: {
    title: 'Prompt Gallery',
    description: 'AI 图像提示词精选 — 浏览、编辑、一键复制。',
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
