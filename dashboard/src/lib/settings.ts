// Which site's settings are open, and at which section. Settings are a dialog
// over the dashboard, so opening them is not a new address: the page under
// them stays where it was, and closing leaves you exactly there. An old
// /settings?site=…&tab=… link still works: main.tsx opens the dialog from it
// and puts the dashboard's own address back.
import { useEffect, useState } from 'react'
import { navigate } from './url'

export type SettingsTab = 'site' | 'install' | 'modules' | 'sharing' | 'payments' | 'search' | 'privacy' | 'alerts' | 'health'
export type SettingsOpen = { site: string; tab: SettingsTab; extra?: Record<string, string> }

let open: SettingsOpen | null = null
const EVENT = 'trckable:settings'
const emit = () => window.dispatchEvent(new Event(EVENT))

/** Open a site's settings over its dashboard. From another page (All sites,
 *  say) the dashboard opens first, with the dialog on it. */
export function openSettings(site: { id: string; domain: string }, tab: SettingsTab = 'site', extra?: Record<string, string>, opts: { replace?: boolean } = {}) {
  const home = '/' + encodeURIComponent(site.domain)
  if (location.pathname !== home) navigate(home, opts)
  open = { site: site.id, tab, extra }
  emit()
}

export function setSettingsTab(tab: SettingsTab) {
  if (!open) return
  open = { site: open.site, tab }
  emit()
}

export function closeSettings() {
  open = null
  emit()
}

export function useSettings(): SettingsOpen | null {
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return open
}

/** A value a link handed to the open section (the visitor to look up, say). */
export const settingsParam = (key: string): string | null => open?.extra?.[key] ?? new URLSearchParams(location.search).get(key)
