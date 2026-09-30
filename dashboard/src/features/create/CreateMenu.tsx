// The Create menu: a goal, a funnel or a note, each in a short dialog
// right here. It has no button of its own in the header: the ⋯ menu's Create
// item and its key (the shortcuts list's 'create') open it (openCreate.ts),
// and it opens right under the ⋯ button, like the menu itself.
// Owners only (a viewer changes nothing), and never on a shared link. With
// every entry's module off there is no menu, and its key does nothing.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { FunnelStep, Row } from '../../lib/api'
import { lazyLoad, whenIdle } from '../../lib/lazyLoad'
import { pressed } from '../../lib/keys'
import { isShared, isViewer } from '../../lib/me'
import { createItems, type Mods } from '../../lib/modules'
import { onOpenCreate, setCreateAvailable } from './openCreate'
import './Create.css'

// The menu itself is its own chunk, fetched while idle (lib/lazyLoad).
const CreatePop = lazyLoad(() => import('./CreatePop'))
const FunnelDialog = lazy(() => import('./FunnelDialog').then((m) => ({ default: m.FunnelDialog })))

export interface CreateMenuProps {
  pages: Row[]
  goals: Row[]
  modules: Mods
  onGoal: () => void
  onNote: () => void
  onFunnel: (steps: FunnelStep[]) => void
}

export function CreateMenu(p: CreateMenuProps) {
  const [open, setOpen] = useState(false)
  const [funnel, setFunnel] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  // Where focus was when the menu opened (the ⋯ button, usually): it goes
  // back there when the menu closes without a choice.
  const back = useRef<HTMLElement | null>(null)
  // The ⋯ button the picker hangs from, wherever the picker was asked for.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const items = createItems(p.modules)
  const allowed = !isViewer() && !isShared() && items.length > 0
  const show = useCallback(() => {
    const dots = document.querySelector<HTMLElement>('.more-btn')
    back.current = dots ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setAnchor(dots)
    setOpen(true)
  }, [])

  // A choice opens a dialog: focus goes back to the button first, so the dialog
  // notes it and returns there when it closes (the menu's own item is gone by then).
  const chosen = (run: () => void) => () => {
    back.current?.focus()
    run()
  }
  useEffect(() => {
    setCreateAvailable(allowed)
    return () => setCreateAvailable(false)
  }, [allowed])
  useEffect(() => (allowed ? onOpenCreate(show) : undefined), [allowed, show])

  // The key opens it from anywhere on the page, except while typing or while
  // another dialog is open.
  useEffect(() => {
    if (!allowed) return
    const onKey = (e: KeyboardEvent) => {
      if (!pressed(e, 'create')) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (document.querySelector('[role=dialog]')) return
      e.preventDefault()
      show()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allowed, show])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.create-menu')) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      back.current?.focus()
    }
    // The picker hangs from a button: if the page moves under it, it goes.
    const close = () => setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    if (allowed) whenIdle(CreatePop.preload)
  }, [allowed])

  if (!allowed) return null
  // CreatePop gives its first choice focus as it mounts.
  return (
    <div ref={root} className="create">
      {open && (
        <Suspense fallback={null}>
          <CreatePop anchor={anchor} items={items} onGoal={chosen(p.onGoal)} onNote={chosen(p.onNote)} onFunnel={chosen(() => setFunnel(true))} onClose={() => setOpen(false)} />
        </Suspense>
      )}
      {funnel && (
        <Suspense fallback={null}>
          <FunnelDialog
            pages={p.pages}
            goals={p.goals}
            onClose={() => setFunnel(false)}
            onSave={(steps) => {
              setFunnel(false)
              p.onFunnel(steps)
              // Full draws the funnel card once its chunk is in: then bring
              // it into view, so the new funnel is where the eye lands.
              setTimeout(() => document.getElementById('sec-behaviour')?.firstElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
