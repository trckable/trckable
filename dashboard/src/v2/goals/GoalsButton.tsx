// The Goals button before Explore in the header, and the small menu it opens. The menu's contents are a chunk of their own,
// fetched when the page is idle. A dot sits on the button while there is a suggested goal the person has not yet seen.
import { Target } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import type { Report, Site } from '../../lib/api'
import { Popover } from '../../kit/Popover'
import { lazyLoad, whenIdle } from '../../lib/lazyLoad'
import { can } from '../../lib/permissions'
import { shows } from '../../lib/modules'
import { useMods } from '../../lib/useMods'
import { goalName } from '../../lib/goalName'
import { goalSuggestions } from '../../views/goalSuggestions'
import { copy } from './copy'
import { markSeen, readSeen } from './seen'
import './goals.css'

const Panel = lazyLoad(() => import('./GoalsPanel'))

interface Props {
  site: Site
  data: Report | null
  onGoal?: () => void
  onChanged?: () => void
}

export function GoalsButton({ site, data, onGoal, onChanged }: Props) {
  const mods = useMods(site.id)
  const [seen, setSeen] = useState(() => readSeen(site.id))
  useEffect(() => whenIdle(Panel.preload), [])
  if (!shows(mods, 'cards', 'goals')) return null
  // What the report alone says is worth suggesting; the menu looks further back and tells the button what it found.
  const known = (data?.current.goals ?? []).map((g) => ({ name: goalName(g.label, g.value), path: '' }))
  const paths = can('goal.create') && data ? goalSuggestions((data.current.dims.page ?? []).map((r) => r.value), known).map((s) => s.path) : []
  const fresh = paths.some((p) => !seen.includes(p))
  return (
    <Popover
      label={copy.menu}
      className="lpop gm mk-tokens"
      maxHeight={460}
      trigger={(t) => (
        <button
          {...t}
          type="button"
          className="mk-chip goalsb"
          id="goalsBtn"
          title={copy.goals}
          aria-label={copy.goals}
          onPointerEnter={Panel.preload}
          onFocus={Panel.preload}
          onClick={() => {
            t.onClick()
            setSeen(markSeen(site.id, paths))
          }}
        >
          <Target size={15} strokeWidth={1.75} aria-hidden={true} />
          <span className="t2">{copy.goals}</span>
          {fresh && <span className="gdot" data-goals-dot aria-hidden="true" />}
        </button>
      )}
    >
      {(close) => (
        <Suspense fallback={null}>
          <Panel site={site} data={data} close={close} onGoal={onGoal} onChanged={onChanged} onSeen={(p) => setSeen(markSeen(site.id, p))} />
        </Suspense>
      )}
    </Popover>
  )
}
