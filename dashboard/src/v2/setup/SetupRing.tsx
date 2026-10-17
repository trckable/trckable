// The setup ring, right of the site switcher: how far the selected site's setup is, and under it (a sheet on a phone)
// what is left. It follows the site, and goes quiet once everything counted is done.
import { useEffect, useRef, useState } from 'react'
import type { Site } from '../../lib/apiMore'
import { canChange, isShared } from '../../lib/me'
import { useTopLayerWhen } from '../../lib/topLayer'
import { useMenu } from '../ui/useMenu'
import { copy } from './copy'
import { useDoneSince, useHidden } from './memory'
import { CIRCUMFERENCE, left, offset, ringMode } from './model'
import { SetupPanel } from './SetupPanel'
import { useSetup } from './useSetup'
import './setup.css'

export function SetupRing({ site, onGoal }: { site: Site | null; onGoal: () => void }) {
  const on = !!site && !isShared()
  const { state, run } = useSetup(site, on)
  const { hidden, hide } = useHidden(on)
  const since = useDoneSince(site?.id ?? null, state ? state.all_set : null)
  const [now] = useState(Date.now)
  const { open, attach, toggle, close } = useMenu()
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  // Another site: the panel of the last one is shut.
  const id = site?.id
  useEffect(close, [id, close])
  if (!site || !state) return null
  const mode = ringMode({ state, hidden: hidden(site.id, left(state)), doneSince: since, now })
  if (mode === 'none') return null
  const words = mode === 'check' ? copy.allSet : copy.ring(state.done, state.counted)
  return (
    <div className="ringw" ref={attach}>
      <button type="button" className="ringb" data-ring={mode} aria-haspopup="dialog" aria-expanded={open} aria-label={copy.ringLabel(state.done, state.counted)} title={words} onClick={toggle}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="rtrack" cx="18" cy="18" r="14" />
          <circle className="rarc" cx="18" cy="18" r="14" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={mode === 'check' ? 0 : offset(state.done, state.counted)} transform="rotate(-90 18 18)" />
          {mode === 'check' && <path className="rtick" d="M12 18.5l4 4 8-9" />}
        </svg>
        <span className="rtext">{words}</span>
      </button>
      <div ref={menu} className={`mk-menu setupmenu${open ? ' on' : ''}`} role="dialog" aria-label={copy.title}>
        {open && (
          <SetupPanel
            state={state}
            x={{ site, onGoal, can: canChange(), change: (fn) => void run(fn), close }}
            onHide={() => {
              hide(site.id, left(state))
              close()
            }}
          />
        )}
      </div>
    </div>
  )
}
