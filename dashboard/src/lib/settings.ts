// Which site's settings are open, and at which section. Settings are a dialog
// over the dashboard, so opening them is not a new address: the page under
// them stays where it was, and closing leaves you exactly there. An old
// /settings?site=…&tab=… link still works: main.tsx opens the dialog from it
// and puts the dashboard's own address back.
import { useEffect, useState } from 'react'
import { navigate } from './url'

export const SETTINGS_TABS = ['site', 'install', 'sharing', 'widgets', 'notes', 'payments', 'search', 'mentions', 'privacy', 'alerts', 'health'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

/** Where an old or mistyped ?tab= goes: a section that exists opens as named; any other (the Modules tab that is gone, say) opens General, scrolled to What the script records. */
export function settingsTarget(raw: string | null): { tab: SettingsTab; extra?: Record<string, string> } {
  if (!raw) return { tab: 'site' }
  const tab = SETTINGS_TABS.find((t) => t === raw)
  return tab ? { tab } : { tab: 'site', extra: { focus: 'script-records' } }
}
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
