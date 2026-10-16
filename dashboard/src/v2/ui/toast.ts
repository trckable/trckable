// The walkthrough's toast: an icon, what happened in bold, and a line under it. One at a time; a new one replaces the
// last. Said from anywhere, drawn by MkToastHost.
import { miniStore } from '../../lib/miniStore'

interface MkToast {
  id: number
  title: string
  sub: string
  red: boolean
  icon: string
}

export const toasts = miniStore<MkToast | null>(null)
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

export function say(title: string, sub: string, o: { red?: boolean; icon?: string; ms?: number } = {}) {
  clearTimeout(timer)
  toasts.set({ id: ++seq, title, sub, red: !!o.red, icon: o.icon ?? (o.red ? '!' : '✓') })
  timer = setTimeout(() => toasts.set(null), o.ms ?? 3200)
}
