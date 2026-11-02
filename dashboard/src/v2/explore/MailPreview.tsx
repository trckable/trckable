// The daily email as it will read, from the numbers What changed tells; opened from the ⋯ menu.
import { useCallback, useState } from 'react'
import { openSettings } from '../../lib/settings'
import type { Report, Site } from '../../lib/api'
import { MailSheet } from '../ui/BriefingSheets'
import { useTab, type DataCtx } from './data/useExplore'
import type { Overview } from './types'
import { mailOf } from './views/Changed'

const KEY = (site: string) => `trckable:mail:${site}`

/** Whether the email is on for the site; kept in the browser, on unless switched off. */
function useMailOn(site: string) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY(site)) !== 'off'
    } catch {
      return true
    }
  })
  const toggle = useCallback(() => {
    setOn((m) => {
      try {
        localStorage.setItem(KEY(site), m ? 'off' : 'on')
      } catch {
        /* a blocked store only forgets */
      }
      return !m
    })
  }, [site])
  return { on, toggle }
}

export function MailPreview({ site, c, onClose }: { site: Site; c: DataCtx; onClose: () => void }) {
  const r = useTab('changed', c, true)
  const mail = useMailOn(site.id)
  if (r.state !== 'ok') return null
  const m = mailOf(r.data as Overview & { report: Report })
  return <MailSheet site={site.domain} headline={m.headline} facts={m.facts} claims={m.claims} on={mail.on} onTime={() => openSettings(site, 'alerts')} onToggle={mail.toggle} onClose={onClose} />
}
