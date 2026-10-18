// The locked card of a section whose source is not connected: revenue, search or goals.
import { copy as brief } from '../../briefing/copy'
import { can, type Action } from '../../../lib/permissions'
import { LockCard } from '../../ui/LockCard'
import type { Setup, XCtx } from '../ctx'

const GO: Record<Setup, string> = { rev: brief.connect, search: brief.connect, goals: brief.setUp }

const MAY: Record<Setup, Action> = { rev: 'payment.manage', search: 'search.connect', goals: 'goal.create' }

export function Lock({ k, x }: { k: Setup; x: XCtx }) {
  return <LockCard kind={k} size="big" go={GO[k]} onGo={can(MAY[k]) ? () => x.connect(k) : undefined} onHow={() => x.how(k)} />
}
