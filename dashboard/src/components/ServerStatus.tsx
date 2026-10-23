// The footer's dot and its few words: is the server there and keeping up (lib/serverStatus.ts), and is
// every site of this account answering (features/sitestatus). It never says "normal" while one fails or
// goes quiet. With a site down or quiet it is the one way in: it opens what happened and what to do.
import { lazy, Suspense, useRef, useState } from 'react'
import { Tooltip } from '../kit/Tooltip'
import type { Site } from '../lib/api'
import { downStateOf, quietSites, statusOf } from '../features/sitestatus/status'
import { copy as status } from '../features/sitestatus/copy'
import { useServerStatus } from '../lib/serverStatus'
import { AnchoredPop } from './AnchoredPop'
import { footerMoreCopy as t } from './footerMoreCopy'

const StatusList = lazy(() => import('../features/sitestatus/StatusList'))

export default function ServerStatus({ sites }: { sites: Site[] }) {
  const server = useServerStatus()
  const down = sites.filter((s) => statusOf(s) === 'down')
  const siteDown = server === 'ok' && down.length > 0
  const quiet = quietSites(sites)
  const hush = server === 'ok' && !siteDown && quiet.length > 0
  const words = t.status[server]
  let label = words.label
  let tip = words.tip
  let state: string = server
  if (hush) {
    label = t.siteQuiet(quiet.length)
    tip = t.siteQuietTip
    state = 'quiet'
  }
  if (siteDown) {
    const names = down.map((s) => s.name || s.domain)
    const checkOnly = down.every((s) => downStateOf(s) === 'visitors') // only our check fails: amber, not red
    label = checkOnly ? t.siteCheck(names) : t.siteDown(names, down.length === 1 ? down[0].down_cause : undefined)
    tip = checkOnly ? t.siteCheckTip : t.siteDownTip
    state = checkOnly ? 'quiet' : 'down'
  }
  let affected: Site[] = []
  if (siteDown) affected = [...down, ...quiet]
  else if (hush) affected = quiet
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
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
