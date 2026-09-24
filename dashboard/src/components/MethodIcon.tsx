// A small drawing per install route, so the picker reads as pictures rather
// than a list of words. Hand-written paths: no icon font, no sprite sheet.
const ICONS: Record<string, string> = {
  code: 'm9 8-5 4 5 4m6-8 5 4-5 4',
  react: 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7Z M8.5 6.5c2.5-4.3 6.3-6.5 8-5.5s1 5-1.5 9.3-6.3 6.5-8 5.5-1-5 1.5-9.3Z',
  next: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 12V9l7 8',
  vue: 'm3 5 9 15L21 5h-4l-5 8.5L7 5H3Z',
  wave: 'M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6',
  cart: 'M4 5h2l2.2 9.5a2 2 0 0 0 2 1.5h6.6a2 2 0 0 0 2-1.6L20.5 8H7M9 20h.01M17 20h.01',
  brush: 'M4 20c3 0 5-1.5 5-4 0-1.4-1.1-2.5-2.5-2.5S4 14.6 4 16v4ZM9.5 13.5 18 5a2 2 0 0 1 3 3l-8.5 8.5',
  server: 'M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01',
  cloud: 'M7 18a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.6 1.4A3.5 3.5 0 0 1 17 18H7Z',
  app: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm4 15h2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z',
}

const FOR: Record<string, string> = {
  script: 'code',
  next: 'next',
  react: 'react',
  vue: 'vue',
  svelte: 'wave',
  astro: 'sparkle',
  remix: 'wave',
  gatsby: 'sparkle',
  angular: 'code',
  static: 'code',
  docusaurus: 'code',
  wordpress: 'brush',
  shopify: 'cart',
  ghost: 'brush',
  webflow: 'brush',
  framer: 'brush',
  squarespace: 'brush',
  wix: 'brush',
  carrd: 'brush',
  bubble: 'brush',
  notion: 'brush',
  gtm: 'cloud',
  lovable: 'sparkle',
  server: 'server',
  proxy: 'cloud',
  app: 'app',
}

export function MethodIcon({ id, size = 20 }: { id: string; size?: number }) {
  const d = ICONS[FOR[id] ?? 'code'] ?? ICONS.code
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
