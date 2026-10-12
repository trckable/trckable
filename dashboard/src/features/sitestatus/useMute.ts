// Snoozing a site's alerts for a day from its card: whether there are alerts
// to snooze, until when they are, and the two calls. The server keeps it.
import { useCallback, useEffect, useState } from 'react'
import { fail, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'

export function useMute(site: Site, can: boolean) {
  const [until, setUntil] = useState(site.alerts_muted_until ?? 0)
  const [have, setHave] = useState(false)
  const [now] = useState(Date.now)
  useEffect(() => {
    if (!can) return
    more
      .alerts(site.id)
      .then((r) => setHave(r.alerts.some((a) => a.enabled)))
      .catch(() => {})
  }, [site.id, can])
  const mute = useCallback(() => more.muteAlerts(site.id).then((r) => setUntil(r.alerts_muted_until)).catch((e: unknown) => fail(e)), [site.id])
  const undo = useCallback(() => more.unmuteAlerts(site.id).then(() => setUntil(0)).catch((e: unknown) => fail(e)), [site.id])
  return { have: have || until > 0, until, on: until * 1000 > now, mute, undo }
}
