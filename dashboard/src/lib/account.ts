// Opening the account dialog is a URL change, so the dashboard can link to it
// without pulling the dialog itself into the first load.
import { navigate, useLocation } from './url'

export type AccountTab = 'sites' | 'keys' | 'people' | 'profile'

const TABS: AccountTab[] = ['sites', 'keys', 'people', 'profile']

/** Which account section the URL asks for, if any. */
export function useAccountTab(): AccountTab | null {
  const { params } = useLocation()
  const v = params.get('account')
  return TABS.includes(v as AccountTab) ? (v as AccountTab) : v === '1' ? 'sites' : null
}

export function openAccount(tab: AccountTab = 'sites') {
  const p = new URLSearchParams(location.search)
  p.set('account', tab)
  navigate(location.pathname + '?' + p.toString())
}

/** Is the add-a-site wizard open? It has an address of its own, so "Add a
 *  site" can open it from anywhere — not open a list with another "Add a
 *  site" button in it. */
export function useAddSite(): boolean {
  const { params } = useLocation()
  return params.get('add') === 'site'
}

export function openAddSite() {
  const p = new URLSearchParams(location.search)
  p.set('add', 'site')
  navigate(location.pathname + '?' + p.toString())
}

export function closeAddSite() {
  const p = new URLSearchParams(location.search)
  p.delete('add')
  const q = p.toString()
  navigate(location.pathname + (q ? '?' + q : ''))
}

export function closeAccount() {
  const p = new URLSearchParams(location.search)
  p.delete('account')
  const q = p.toString()
  navigate(location.pathname + (q ? '?' + q : ''))
}
