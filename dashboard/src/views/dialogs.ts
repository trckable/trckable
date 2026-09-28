// The account and settings windows: their own chunks, fetched once the page
// is idle, so the first open is immediate (lib/lazyLoad.ts).
import { useEffect } from 'react'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'

export const SettingsDialog = lazyLoad(() => import('./Settings').then((m) => ({ default: m.SettingsDialog })))
export const AccountDialog = lazyLoad(() => import('./Account').then((m) => ({ default: m.AccountDialog })))

export function usePreloadDialogs(ready: boolean) {
  useEffect(() => {
    if (ready)
      whenIdle(() => {
        AccountDialog.preload()
        SettingsDialog.preload()
      })
  }, [ready])
}
