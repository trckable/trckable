// A small card that slides in from the side, for a nudge or a finding: what it
// is (an icon with its own tint, and when it happened), its title or figure, a
// body, its actions, and a small chart of the moment running to the bottom edge. It floats above the page
// (bottom right above the Peek button; a bottom sheet with a grab handle on a
// phone), so it never moves the layout. One at a time (useSideCard). A card that
// holds several things (a deck) shows where it is as dots, with the next card
// peeking out behind, and ← → (with focus in the card) and a swipe turn it.
// Escape or the close puts it away; focus is not taken from what the person is
// doing, and goes back where it was when the card is closed from inside. It
// springs in and out; reduced motion: it just appears.
import { X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { reducedMotion } from '../../lib/motion'
import { Ghost } from '../Logo'
import { Deck, type DeckProps } from './Deck'
import { useSideCard } from './useSideCard'
import './SideCard.css'

/** The way out for a button inside a card: leaves as the close button does (springs out, then is closed). */
const Leaving = createContext<() => void>(() => undefined)
export const useCardClose = () => useContext(Leaving)

/** What the card is: a small icon, its name and its own colour (a token, never a literal). */
export interface SideKind {
  icon: ReactNode
  label: string
  /** A CSS colour, normally a token ("var(--money)"). The accent when absent. */
  tint?: string
}

/** When it happened: the words ("yesterday") and the date for a tooltip ("Sat, Sep 28"). */
export interface SideWhen {
  text: string
  title: string
}

export interface SideCardProps {
  /** Tells the slot apart from other cards. */
  id: string
  /** The card's name for assistive tech. */
  label: string
  /** The close button's name (the caller's words). */
  closeLabel: string
  /** Someone asked for it (a click): it does not wait behind a card that came up by itself. */
  asked?: boolean
  title: ReactNode
  onClose: () => void
  actions: ReactNode
  children?: ReactNode
  kind?: SideKind
  when?: SideWhen
  /** A small chart of the moment, under the body. */
  chart?: ReactNode
  /** Several things in one card: dots, the next one peeking, ← → and a swipe. */
  deck?: DeckProps
  /** The ghost in the corner: for a milestone and a first sale only. */
  ghost?: boolean
  /** Something that stands on the card's top edge (the milestone's ghost): it never covers the card. */
  crown?: ReactNode
}

/** How long a card takes to leave: its exit animation (SideCard.css, side-out), so what follows waits for it. */
const LEAVE_MS = 200
const SWIPE = 40

export function SideCard({ id, label, closeLabel, asked, title, onClose, actions, children, kind, when, chart, deck, ghost, crown }: SideCardProps) {
  const mine = useSideCard(id, asked)
  const card = useRef<HTMLElement>(null)
  const before = useRef<Element | null>(null)
  // Leaving: the exit animation runs, then what was asked for happens.
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // What a leave still owes: a card cut off mid-animation (a dialog its button opened takes the
  // screen) still closes, or it would come back once the dialog is gone.
  const owed = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      owed.current?.()
    },
    [],
  )
  const leave = (then: () => void) => {
    if (reducedMotion() || leaving) {
      then()
      return
    }
    setLeaving(true)
    owed.current = then
    timer.current = setTimeout(() => {
      owed.current = null
      setLeaving(false)
      then()
    }, LEAVE_MS)
  }
  const close = () => leave(onClose)
  const turn = (step: 1 | -1) => {
    if (!deck || deck.count < 2) return
    const to = step === 1 ? deck.onNext : deck.onPrev
    leave(to)
  }
  // The next card of a deck springs in: the animation starts again on the same element, so the
  // keyboard stays where it was (on the button that was pressed).
  const index = deck?.index
  const first = useRef(true)
  useEffect(() => {
    const el = card.current
    if (first.current) {
      first.current = false
      return
    }
    if (!el) return
    el.style.animation = 'none'
    el.getBoundingClientRect() // a read of the layout, so the animation really starts again
    el.style.animation = ''
  }, [index])
  // A swipe on a deck turns it (pointer events, so a finger and a mouse drag both do).
  useEffect(() => {
    const el = card.current
    if (!mine || !el || !deck || deck.count < 2) return
    let from: number | null = null
    const down = (e: PointerEvent) => (from = e.clientX)
    const up = (e: PointerEvent) => {
      if (from !== null && Math.abs(e.clientX - from) > SWIPE) turn(e.clientX < from ? 1 : -1)
      from = null
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
    }
  })
  useEffect(() => {
    if (!mine) return
    const el = card.current
    const keep = (e: FocusEvent) => {
      if (!before.current && e.relatedTarget instanceof Element && !el?.contains(e.relatedTarget)) before.current = e.relatedTarget
    }
    el?.addEventListener('focusin', keep)
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const inside = el?.contains(document.activeElement)
      // Only when nothing else has the keyboard: the card itself, or the page.
      if (e.key === 'Escape' && (inside || document.activeElement === document.body)) close()
      // The arrows are the page's own (they step the period): the card takes them only with focus in it.
      if (inside && deck && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !(e.target as HTMLElement).closest('input, textarea, select')) {
        e.preventDefault()
        turn(e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      el?.removeEventListener('focusin', keep)
      document.removeEventListener('keydown', key)
      if (el?.contains(document.activeElement) && before.current instanceof HTMLElement && before.current.isConnected) before.current.focus()
    }
  }) // close and turn read the latest props and state, so the keys are bound again every render
  if (!mine) return null
  const stacked = !!deck && deck.count > 1
  return createPortal(
    <div className={'side-deck' + (stacked ? ' is-stack' : '')}>
      {crown}
      {ghost && (
        <span className="side-ghost" aria-hidden="true">
          <Ghost size={56} />
        </span>
      )}
      {stacked && <i className="side-peek" aria-hidden="true" />}
      {stacked && <i className="side-peek p2" aria-hidden="true" />}
      <aside
        ref={card}
        tabIndex={-1}
        className={'side-card flat' + (kind ? ' has-kind' : '') + (leaving ? ' leaving' : '')}
        style={kind?.tint ? ({ '--tint': kind.tint } as CSSProperties) : undefined}
        aria-label={label}
      >
        <span className="side-grab" aria-hidden="true" />
        <button type="button" className="side-card-x" aria-label={closeLabel} onClick={close}>
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        {kind && (
          <div className="side-kind">
            <span className="side-ic" aria-hidden="true">
              {kind.icon}
            </span>
            <span>{kind.label}</span>
            {when && (
              <span className="side-when" title={when.title} aria-label={`${when.text}, ${when.title}`}>
                {when.text}
              </span>
            )}
          </div>
        )}
        <b className="side-card-title">{title}</b>
        {children}
        <div className="side-card-actions">
          {deck && <Deck {...deck} onPrev={() => turn(-1)} onNext={() => turn(1)} />}
          <Leaving.Provider value={close}>{actions}</Leaving.Provider>
        </div>
        {chart}
      </aside>
    </div>,
    document.body,
  )
}
