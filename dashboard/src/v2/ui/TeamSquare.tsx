// The team at the start of the header, for a build that has several: a small square with the current team's initial. It opens a
// short list of the person's teams (the current one checked) and Manage teams. Picking one is the build's (it moves the whole page).
import { useCallback, useRef, useState } from 'react'
import { Check, GripVertical } from 'lucide-react'
import { useMenuNav, useOnlyOpen } from '../../lib/headerMenu'
import { moveBefore, pointedBefore, stepOrder } from '../../lib/listOrder'
import { useTopLayerWhen } from '../../lib/topLayer'
import { useDragList } from '../../lib/useDragList'
import { copy } from '../copy'
import type { Teams } from '../slots'
import { useMenu } from './useMenu'

type Team = Teams['list'][number]

function Mark({ team, size }: { team: Team; size: number }) {
  if (team.mark) return <>{team.mark(size)}</>
  return (
    <span className="team-mk" style={{ width: size, height: size }} aria-hidden="true">
      {team.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function TeamSquare({ teams }: { teams: Teams }) {
  const { open, setOpen, attach, close } = useMenu()
  const menu = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useTopLayerWhen(open, menu)
  useOnlyOpen('teams', open, close)
  useMenuNav(open, menu, button, close)
  const here = teams.list.find((t) => t.id === teams.current) ?? teams.list[0]
  // Focus goes back to the square before the choice runs, so a dialog it opens hands focus back there.
  const go = useCallback(
    (fn: () => void) => () => {
      setOpen(false)
      button.current?.focus()
      fn()
    },
    [setOpen],
  )
  const rows = useRef<HTMLDivElement>(null)
  const [said, setSaid] = useState('')
  const ids = teams.list.map((t) => t.id)
  // The person's own order: dragging a row (or Alt + ↑/↓ on it) hands the new order to the build. Nothing to arrange with one team.
  const save = teams.onReorder
  const arrangeable = !!save && ids.length > 1
  const drag = useDragList<string[]>({
    key: 'team',
    current: ids,
    save: (next) => save?.(next),
    list: rows,
    resolve: (box, id, y, preview) => {
      const to = pointedBefore(box, 'team', id, y)
      return to ? moveBefore(preview, id, to.before) : null
    },
  })
  const shown = drag.preview ? drag.preview.flatMap((id) => teams.list.find((t) => t.id === id) ?? []) : teams.list
  const keys = (t: Team) => (e: React.KeyboardEvent) => {
    if (!arrangeable || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const next = stepOrder(ids, t.id, e.key === 'ArrowUp' ? -1 : 1)
    if (next === ids) return
    save?.(next)
    setSaid(copy.teamMoved(t.name, next.indexOf(t.id) + 1))
    requestAnimationFrame(() => rows.current?.querySelector<HTMLElement>(`[data-team="${CSS.escape(t.id)}"] .mi`)?.focus())
  }
  if (!here) return null
  return (
    <div ref={attach} className="teamchip" style={{ position: 'relative' }}>
      <button ref={button} type="button" className="mk-chip team-btn" aria-haspopup="menu" aria-expanded={open} aria-label={here.name} title={here.name} data-key="team" onClick={() => setOpen((o) => !o)}>
        <Mark team={here} size={24} />
      </button>
      <div ref={menu} className={`mk-menu teams${open ? ' on' : ''}`} role={open ? 'menu' : undefined} aria-label={open ? copy.teams : undefined}>
        {open && (
          <>
            <div ref={rows} className={`team-rows${drag.id ? ' reordering' : ''}`}>
              {shown.map((t) => (
                <div key={t.id} role="none" data-team={t.id} className={['team-row', arrangeable && 'sortable', drag.id === t.id && 'dragging'].filter(Boolean).join(' ')} onPointerDown={(e) => arrangeable && drag.grab(e, t.id)} onDragStart={(e) => e.preventDefault()}>
                  {arrangeable && <GripVertical className="grip" size={14} strokeWidth={2} aria-hidden="true" />}
                  <button type="button" role="menuitemradio" aria-checked={t.id === here.id} disabled={t.off} className="mi team" onKeyDown={keys(t)} onClick={go(() => t.id !== here.id && teams.onPick(t.id))}>
                    <Mark team={t} size={22} />
                    <span className="mt2">
                      <div className="nm">{t.name}</div>
                    </span>
                    {t.id === here.id && <Check size={14} strokeWidth={2} aria-hidden="true" />}
                  </button>
                </div>
              ))}
            </div>
            <p className="sr" aria-live="polite">
              {said}
            </p>
            <button type="button" role="menuitem" className="mi team manage" onClick={go(teams.onManage)}>
              {copy.manageTeams}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
