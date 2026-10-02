// The site's cookieless setting, read and saved where the rest of its privacy
// settings live (consent_free). It is the one source of truth: the server
// writes it into the site's own script, so the snippet never has to change.
import { useEffect, useState } from 'react'
import { type SiteConfig, more } from '../../lib/apiMore'
import { isViewer } from '../../lib/me'
import { toast } from '../../components/Toast'
import { copy } from './copy'

export type Cookieless = {
  /** null until the setting has loaded. */
  on: boolean | null
  saving: boolean
  /** Viewers see the setting but cannot change it. */
  locked: boolean
  set: (on: boolean) => void
}

export function useCookieless(site: string): Cookieless {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let live = true
    more
      .siteConfig(site)
      .then((c) => live && setCfg(c))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [site])

  const set = (on: boolean) => {
    if (!cfg || saving) return
    setSaving(true)
    more
      .setSiteConfig(site, { ...cfg, consent_free: on })
      .then((c) => {
        setCfg(c)
        toast(copy.cookieless.saved(c.consent_free))
      })
      .catch(() => toast(copy.cookieless.failed, 'error'))
      .finally(() => setSaving(false))
  }
  return { on: cfg ? cfg.consent_free : null, saving, locked: isViewer(), set }
}
