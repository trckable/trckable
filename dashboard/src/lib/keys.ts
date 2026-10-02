// One keymap for every shortcut. Each action has a default key; a person can
// change any of them in the shortcuts list, and their choice is kept on the
// server with their account, so it follows them to another browser. Esc is
// not in here: closing what is open is the same key everywhere, on purpose.
import { useEffect, useState } from 'react'
import { PRESETS } from './dates'

// The default key of each action; their names and groups are in the shortcuts
// list (views/Shortcuts.tsx), which only loads when it is opened. Presets carry
// their own default keys (lib/dates.ts). C is Compare's, so Create answers to A (add).
const DEFAULTS: Record<string, string> = {
  shortcuts: '?',
  ask: 'mod+k',
  mode: 'f',
  live: 'l',
  create: 'a',
  back: 'arrowleft',
  forward: 'arrowright',
  compare: 'c',
  ...Object.fromEntries(PRESETS.flatMap((p) => (p.key ? [['period.' + p.id, p.key]] : []))),
}

/** The key an action answers to before anyone changes it. */
export const defaultOf = (id: string): string => DEFAULTS[id] ?? ''

let custom: Record<string, string> = {}

/** The key each action answers to now. */
export function keyFor(id: string): string {
  return custom[id] ?? defaultOf(id)
}

/** Set by the boot code from /me, and again after each change. */
export function loadKeymap(saved: Record<string, string> | undefined) {
  custom = {}
  for (const [id, k] of Object.entries(saved ?? {})) if (id in DEFAULTS && k) custom[id] = k
  window.dispatchEvent(new CustomEvent('trckable:keys'))
}

export const customKeys = () => ({ ...custom })

/** What a key press is called in the keymap: "k", "mod+k", "arrowleft", "?". */
export function comboOf(e: KeyboardEvent): string {
  let k = e.key.toLowerCase()
  if (k === 'meta' || k === 'control' || k === 'alt' || k === 'shift') return ''
  // Some layouts report the shifted slash as "/" with Shift held.
  if (e.shiftKey && e.code === 'Slash') k = '?'
  if (k === ' ') k = 'space'
  return (e.metaKey || e.ctrlKey ? 'mod+' : '') + (e.altKey ? 'alt+' : '') + k
}

/** Whether a key press is the one an action answers to. */
export const pressed = (e: KeyboardEvent, id: string) => comboOf(e) === keyFor(id)

// navigator.platform is deprecated, but its replacement (userAgentData) is
// Chromium-only and untyped; platform still answers everywhere.
// eslint-disable-next-line @typescript-eslint/no-deprecated -- no typed, cross-browser replacement yet
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const NAMES: Record<string, string> = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', space: 'Space', enter: '↵' }

function cap(p: string): string {
  if (p === 'mod') return MAC ? '⌘' : 'Ctrl'
  if (p === 'alt') return MAC ? '⌥' : 'Alt'
  return NAMES[p] ?? p.toUpperCase()
}

/** A key as keycaps: "mod+k" is ⌘ K on a Mac and Ctrl K elsewhere. */
export function caps(combo: string): string[] {
  return combo.split('+').map(cap)
}

/** Re-render when the keymap changes. */
export function useKeymap() {
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener('trckable:keys', on)
    return () => window.removeEventListener('trckable:keys', on)
  }, [])
}
