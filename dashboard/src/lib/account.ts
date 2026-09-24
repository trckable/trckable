// The account dialog and the add-a-site wizard, like every dialog, open over
// the page without changing its address: closing one leaves the page exactly
// as it was. Old links that carried ?account=… or ?add=site still open them
// once, and the address is put back.
import { useEffect, useState } from 'react'

export type AccountTab = 'sites' | 'keys' | 'people' | 'profile'

const TABS: AccountTab[] = ['sites', 'keys', 'people', 'profile']
const EVENT = 'trckable:dialogs'

let account: AccountTab | null = null
let adding = false
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
  if (v !== null) account = TABS.includes(v as AccountTab) ? (v as AccountTab) : 'sites'
  if (p.get('add') === 'site') adding = true
  if (v !== null || p.has('add')) {
    p.delete('account')
    p.delete('add')
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
  return adding
}

export function openAddSite() {
  adding = true
  emit()
}

export function closeAddSite() {
  adding = false
  emit()
}
