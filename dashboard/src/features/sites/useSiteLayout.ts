// The account's site layout, read once and shared by the switcher and All
// sites. A change shows at once and is saved behind it; if the server says
// no, the last saved layout comes back with the reason as a toast.
import { useEffect, useState } from 'react'
import { api, messageOf, type SiteLayout } from '../../lib/api'
import { toast } from '../../components/Toast'
import { EMPTY } from './layout'

let current: SiteLayout | null = null
let loading: Promise<void> | null = null
const subs = new Set<(l: SiteLayout) => void>()
const emit = (l: SiteLayout) => {
  current = l
  subs.forEach((f) => f(l))
}

function load() {
  loading ??= api
    .siteLayout()
    .then(emit)
    .catch(() => emit(EMPTY)) // no layout is the order sites were made in
  return loading
}

/** Save a layout: shown now, kept if the server agrees. */
export function saveLayout(next: SiteLayout) {
  const was = current ?? EMPTY
  emit(next)
  api
    .setSiteLayout(next)
    .then(emit)
    .catch((e: unknown) => {
      emit(was)
      toast(messageOf(e), 'error')
    })
}

/** The layout, or null until it has loaded (then the plain order shows). */
export function useSiteLayout(): SiteLayout | null {
  const [l, setL] = useState(current)
  useEffect(() => {
    subs.add(setL)
    void load()
    return () => {
      subs.delete(setL)
    }
  }, [])
  return l
}
