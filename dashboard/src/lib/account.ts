// The account dialog and the add-a-site wizard, like every dialog, open over
// the page without changing its address: closing one leaves the page exactly
// as it was. Old links that carried ?account=… or ?add=site still open them
// once, and the address is put back.
import { useEffect, useState } from 'react'
import { prefillFrom, type SitePrefill } from './addSiteLink'
import { can } from './permissions'

export type AccountTab = 'sites' | 'keys' | 'people' | 'profile'

const TABS: AccountTab[] = ['sites', 'keys', 'people', 'profile']

/** A tab asked for by name (an old link): one of the window's own, or null. */
export function tabNamed(v: string): AccountTab | null {
  return (TABS as string[]).includes(v) ? (v as AccountTab) : null
}
const EVENT = 'trckable:dialogs'

let account: AccountTab | null = null
let adding = false
let prefill: SitePrefill | null = null
const emit = () => window.dispatchEvent(new Event(EVENT))

function useDialogs() {
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
}

// An old address with ?account= or ?add=: open what it asked for, once.
{
  const p = new URLSearchParams(location.search)
  const v = p.get('account')
  if (v !== null) account = tabNamed(v) ?? 'sites'
  if (p.get('add') === 'site') {
    adding = true
    prefill = prefillFrom(p)
  }
  if (v !== null || p.has('add')) {
    for (const k of ['account', 'add', 'domain', 'taken']) p.delete(k)
    const q = p.toString()
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash)
  }
}

/** Which account section is open, if any. */
export function useAccountTab(): AccountTab | null {
  useDialogs()
  return account
}

export function openAccount(tab: AccountTab = 'sites') {
  account = tab
  emit()
}

export function closeAccount() {
  account = null
  emit()
}

/** Is the add-a-site wizard open? */
export function useAddSite(): boolean {
  useDialogs()
  // An old link (?add=site) sets it before anyone is known: a viewer still gets no wizard.
  return adding && can('site.add')
}

/** A viewer adds no site: the wizard stays shut for them, whatever opened it (a link, the first run, a key). */
export function openAddSite(domain: SitePrefill | null = null) {
  if (!can('site.add')) return
  adding = true
  prefill = domain
  emit()
}

export function closeAddSite() {
  adding = false
  prefill = null
  emit()
}

/** The domain a link asked the wizard to open with, if any. */
export function addSitePrefill(): SitePrefill | null {
  return prefill
}
