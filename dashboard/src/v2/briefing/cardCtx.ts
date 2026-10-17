// What a card does when it is pressed (open, go deeper, watch, act, say how it knows), and the rows of what is being watched.
import type { Site } from '../../lib/api'
import { fmtCompact } from '../../lib/format'
import { toggleWatch, type Watched } from '../../lib/watch'
import type { CardCtx } from '../ui/StoryCard'
import { say as flash } from '../ui/toast'
import { runAct } from './actions'
import type { Story } from './cards'
import { copy } from './copy'
import { goDeeper } from './deeper'
import type { useBriefingState } from './useBriefingState'

export function cardCtx(o: { site: Site; ui: ReturnType<typeof useBriefingState>; wset: Record<string, Watched>; nowSec: number; hhmm: string; spark: number[]; onGoal: () => void }): CardCtx {
  const { site, ui, wset } = o
  const key = (s: Story) => `${site.id}|${s.key}`
  return {
    verified: site.verified,
    know: () => null,
    onOpen: (s) => window.matchMedia('(max-width: 600px)').matches && ui.setOpen(s),
    onDeeper: (s) => goDeeper(site, s.deeper),
    watched: (s) => key(s) in wset,
    onWatch: (s) => {
      if (key(s) in wset) toggleWatch(key(s), { at: 0, m: 0, u: '' })
      else {
        toggleWatch(key(s), { at: o.nowSec, m: s.m, u: s.u })
        flash(copy.watchingTitle(copy.topic(s.key)), copy.watchingSub(o.hhmm))
      }
    },
    spark: () => o.spark,
    onAct: (s) => runAct(s, { site, onGoal: o.onGoal }) && ui.markDone(key(s)),
    done: (s) => ui.done.has(key(s)),
    how: (s) => ui.how.has(key(s)),
    onHow: (s) => ui.toggleHow(key(s)),
    focused: ui.kf,
  }
}

/** One row of the Watching card per card of this site that is being watched: what it was, and how it moved since. */
export function watchRowsOf(site: string, wset: Record<string, Watched>, stories: Story[]) {
  return Object.entries(wset)
    .filter(([k]) => k.startsWith(site + '|'))
    .map(([k, w]) => {
      const s = stories.find((x) => `${site}|${x.key}` === k)
      const d = s ? s.m - w.m : 0
      return { key: k, topic: copy.topic(k.split('|')[1]), gone: !s, since: { at: new Date(w.at * 1000).toISOString().slice(11, 16), delta: `${d < 0 ? '−' : '+'}${fmtCompact(Math.abs(d))}`, unit: w.u } }
    })
}
