// The footer's dot and its few words: is the server there and keeping up (lib/serverStatus.ts), and is
// whether a site went quiet (features/sitestatus). It never says "normal" while one fails or goes quiet.
// With a site quiet it opens what happened and what to do.
import { lazy, Suspense, useRef, useState } from 'react'
import { Tooltip } from '../kit/Tooltip'
import type { Site } from '../lib/api'
import { quietSites, statusOf } from '../features/sitestatus/status'
import { copy as status } from '../features/sitestatus/copy'
import { useServerStatus } from '../lib/serverStatus'
import { AnchoredPop } from './AnchoredPop'
import { footerMoreCopy as t } from './footerMoreCopy'

const StatusList = lazy(() => import('../features/sitestatus/StatusList'))

export default function ServerStatus({ sites }: { sites: Site[] }) {
  const server = useServerStatus()
  const down = sites.filter((s) => statusOf(s) === 'down')
  const quiet = quietSites(sites)
  const hush = server === 'ok' && quiet.length > 0
  const words = t.status[server]
  let label = words.label
  let tip = words.tip
  let state: string = server
  if (hush) {
    label = t.siteQuiet(quiet.length)
    tip = t.siteQuietTip
    state = 'quiet'
  }
  let affected: Site[] = []
  if (hush) affected = quiet
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  // A site that is down is told in the site selector; here the line stays empty, never "normal".
  if (server === 'ok' && down.length > 0 && !hush) return null
  return (
    <>
      <Tooltip text={tip}>
        {(p) => (
          <button
            ref={btn}
            type="button"
            className="footer-status"
            data-status={state}
            aria-label={label} // the words are in a clipped span: WebKit's scan sometimes reads it as empty
            {...p}
            {...(affected.length > 0 ? { 'aria-haspopup': 'dialog' as const, 'aria-expanded': open } : {})}
            onClick={() => {
              p.onClick()
              if (affected.length > 0) setOpen((o) => !o)
            }}
          >
            <i aria-hidden="true" />
            <span>{label}</span>
          </button>
        )}
      </Tooltip>
      {open && affected.length > 0 && (
        <AnchoredPop anchor={btn} label={status.list} className="status-pop" onClose={() => setOpen(false)}>
          {() => (
            <Suspense fallback={null}>
              <StatusList sites={affected} />
            </Suspense>
          )}
        </AnchoredPop>
      )}
    </>
  )
}
