const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') || '';

export function withBasePath(src: string): string {
  if (!BASE_PATH || !src.startsWith('/')) return src;
  if (src === BASE_PATH || src.startsWith(`${BASE_PATH}/`)) return src;
  return `${BASE_PATH}${src}`;
}
