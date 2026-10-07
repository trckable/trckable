// The theme is chosen before anything renders, so it lives on its own and
// costs a few bytes in the first load.
import { useEffect, useState } from 'react'
import './paneSheen'

export type Theme = 'system' | 'dark' | 'light'

export const THEMES: Theme[] = ['system', 'dark', 'light']

export function applyTheme(t: string) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
  else delete document.documentElement.dataset.theme
}

const KEY = 'trckable:theme'

const read = (): Theme => {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'dark' || t === 'light' ? t : 'system'
  } catch {
    return 'system'
  }
}

// The theme can be changed from two places — the ⋯ menu and Your account — so
// they share one value and hear about each other's changes.
const watchers = new Set<(t: Theme) => void>()

/** The chosen theme, and a way to change it that every other control sees. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    watchers.add(setTheme)
    return () => {
      watchers.delete(setTheme)
    }
  }, [])
  const pick = (t: Theme) => {
    // The crossfade is its own small chunk, fetched when a theme is first chosen.
    void import('./themeSwitch').then((m) => m.switchTheme(t, applyTheme))
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* private mode */
    }
    for (const w of watchers) w(t)
  }
  return [theme, pick]
}
