// The hints' host: every second asks the rules whether a hint is due, finds
// the place it points at, and draws it there. Its own chunk (HintsDoor).
import { useEffect, useRef, useState } from 'react'
import { Hint } from '../../components/Hint'
import { caps, keyFor } from '../../lib/keys'
import { isViewer } from '../../lib/me'
import { readView, useLocation } from '../../lib/url'
import { storyOn } from '../storyview/mode'
import { copy } from './copy'
import { nextHint, type HintId } from './rules'
import { keep, kept, type Kept, markShown, shownThisVisit } from './store'

/** Where each hint points. The answers are Story's; the rows are Explore's lists; Peek is the header's button. */
const ANCHOR: Record<HintId, string> = {
  story: '.sv-answers .sv-answer',
  rows: '#cards .bl-row',
  peek: '.header button.ask',
}

/** The place a hint points at, once it is on screen: a hint waits for the page to be scrolled to what it is about. */
const find = (id: HintId): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(ANCHOR[id])
  if (!el || el.getClientRects().length === 0) return null
  const r = el.getBoundingClientRect()
  const shown = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)
  return shown >= Math.min(40, r.height) ? el : null
}

const covered = () => !!document.querySelector('[role="dialog"], [role="menu"]')

/** Which of the places the hints point at are on the page now. */
function placesNow(): Record<HintId, boolean> {
  const story = storyOn(readView(new URLSearchParams(location.search)))
  return { story: story && !!find('story'), rows: !story && !!find('rows'), peek: !!find('peek') }
}

export default function HintHost() {
  useLocation()
  const [, tick] = useState(0)
  const [on, setOn] = useState<HintId | null>(null)
  const [state, setState] = useState(kept)
  const asked = useRef(false)
  useEffect(() => {
    const viewer = isViewer()
    const t = setInterval(() => {
      tick((n) => n + 1)
      if (asked.current) return
      const k = kept()
      const id = nextHint({ ...k, shown: shownThisVisit(), age: performance.now(), viewer, here: placesNow(), covered: covered() })
      if (!id) return
      asked.current = true
      markShown()
      setOn(id)
    }, 1000)
    return () => clearInterval(t)
  }, [])
  if (!on || state.off || !placesNow()[on]) return null
  const target = find(on)
  if (!target) return null
  const put = (next: Kept) => {
    keep(next)
    setState(next)
    setOn(null)
  }
  const words = { title: copy.title, seen: copy.seen, off: copy.off, close: copy.close }
  const text = on === 'peek' ? copy.peek(caps(keyFor('ask')).join('')) : copy[on]
  return <Hint target={target} text={text} words={words} onSeen={() => put({ ...state, seen: [...state.seen, on] })} onOff={() => put({ ...state, off: true })} />
}
