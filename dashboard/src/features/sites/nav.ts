// The switcher's keyboard, as plain functions: ↑/↓ step through the stops
// (search, All sites, each site, Add a site) and wrap; 1–9 open the site
// shown at that number unless a text field is being typed in.

/** The stop after `at` in direction `dir`, wrapping; `at` is -1 when focus is on none of them. */
export function stepFocus(at: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1
  if (at < 0) return dir > 0 ? 0 : count - 1
  return (at + dir + count) % count
}

/** The 0-based place a number key points at, or -1 when the key is not 1–9 or nothing is there. */
export function digitIndex(key: string, count: number): number {
  if (!/^[1-9]$/.test(key)) return -1
  const i = Number(key) - 1
  return i < count ? i : -1
}

/** Whether keys go into this element as text. */
export function typing(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}
