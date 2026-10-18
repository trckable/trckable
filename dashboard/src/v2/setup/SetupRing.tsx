// The setup ring, right of the site switcher: how far the selected site's setup is, and under it (a sheet on a phone)
// what is left. It follows the site, and goes quiet once everything counted is done.
import { useEffect, useRef, useState } from 'react'
import type { Site } from '../../lib/apiMore'
import { canChange, isShared } from '../../lib/me'
import { useTopLayerWhen } from '../../lib/topLayer'
import { VerifiedPill } from '../../features/verified/VerifiedPill'
import { useMenu } from '../ui/useMenu'
import { copy } from './copy'
import { useDoneSince, useHidden } from './memory'
import { CIRCUMFERENCE, left, offset, ringMode } from './model'
import { SetupPanel } from './SetupPanel'
import { onSetupOpen, publishSetup } from './summary'
import { useSetup } from './useSetup'
import './setup.css'

const ringWords = (mode: string, done: number, counted: number) => (mode === 'check' ? copy.allSet : copy.ring(done, counted))

export function SetupRing({ site, onGoal }: { site: Site | null; onGoal: () => void }) {
  const on = !!site && !isShared()
  const { state, run, failed } = useSetup(site, on)
  const { hidden, hide } = useHidden(on)
  const since = useDoneSince(site?.id ?? null, state ? state.all_set : null)
  const [now] = useState(Date.now)
  const { open, setOpen, attach, toggle, close } = useMenu()
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  // Another site: the panel of the last one is shut.
  const id = site?.id
  useEffect(close, [id, close])
  const mode = site && state ? ringMode({ state, hidden: hidden(site.id, left(state)), doneSince: since, now }) : 'none'
  const said = site && state && mode !== 'none' ? ringWords(mode, state.done, state.counted) : null
  useEffect(() => {
    publishSetup(said)
    return () => publishSetup(null)
  }, [said])
  // The site menu's own line for the ring, where the header has no room for it.
  useEffect(() => onSetupOpen(() => setOpen(true)), [setOpen])
  if (!site) return null
  // One indicator at a time, in one slot: the ring while setup is open (the verify step is a row in its panel), the verified seal
  // once the ring has gone, or where there is no setup to show. Nothing while the checklist is still on its way.
  if (mode === 'none' && (state || failed || !on)) return <div className="ringw seal-slot"><VerifiedPill verified={site.verified} site={site} seal /></div>
  if (!state || mode === 'none') return null
  const words = said ?? ''
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
