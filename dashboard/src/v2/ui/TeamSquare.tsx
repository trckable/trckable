// The team at the start of the header, for a build that has several: a small square with the current team's initial. It opens a
// short list of the person's teams (the current one checked) and Manage teams. Picking one is the build's (it moves the whole page).
import { useCallback, useRef } from 'react'
import { Check } from 'lucide-react'
import { useMenuNav, useOnlyOpen } from '../../lib/headerMenu'
import { useTopLayerWhen } from '../../lib/topLayer'
import { copy } from '../copy'
import type { Teams } from '../slots'
import { useMenu } from './useMenu'

type Team = Teams['list'][number]

function Mark({ team, size }: { team: Team; size: number }) {
  return (
    <span className="team-mk" style={{ width: size, height: size }} aria-hidden="true">
      {team.mark ? team.mark(size) : team.name.slice(0, 1).toUpperCase()}
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
  if (!here) return null
  return (
    <div ref={attach} className="teamchip" style={{ position: 'relative' }}>
      <button ref={button} type="button" className="mk-chip team-btn" aria-haspopup="menu" aria-expanded={open} aria-label={here.name} title={here.name} data-key="team" onClick={() => setOpen((o) => !o)}>
        <Mark team={here} size={24} />
      </button>
      <div ref={menu} className={`mk-menu teams${open ? ' on' : ''}`} role={open ? 'menu' : undefined} aria-label={open ? copy.teams : undefined}>
        {open && (
          <>
            {teams.list.map((t) => (
              <button key={t.id} type="button" role="menuitemradio" aria-checked={t.id === here.id} className="mi team" onClick={go(() => t.id !== here.id && teams.onPick(t.id))}>
                <Mark team={t} size={22} />
                <span className="mt2">
                  <div className="nm">{t.name}</div>
                </span>
                {t.id === here.id && <Check size={14} strokeWidth={2} aria-hidden="true" />}
              </button>
            ))}
            <button type="button" role="menuitem" className="mi team manage" onClick={go(teams.onManage)}>
              {copy.manageTeams}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
