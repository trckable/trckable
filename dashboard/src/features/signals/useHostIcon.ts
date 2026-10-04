// Whether this server has an icon for a referring site (asked once, from its own
// cache: the browser never asks the site).
import { useEffect, useState } from 'react'
import { call } from '../../lib/api'

export function useHostIcon(host: string | null): boolean {
  const [got, setGot] = useState<{ host: string; has: boolean } | null>(null)
  useEffect(() => {
    if (!host) return
    let live = true
    call<{ icons: string[] }>('GET', '/referrer-icons?host=' + encodeURIComponent(host), undefined, undefined, true)
      .then((r) => live && setGot({ host, has: r.icons.length > 0 }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [host])
  return !!host && got?.host === host && got.has
}
