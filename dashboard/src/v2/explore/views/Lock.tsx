// The locked card of a section whose source is not connected: revenue, search or goals. It says what connecting gives and shows no example figures.
import { copy as brief } from '../../briefing/copy'
import { LockCard } from '../../ui/LockCard'
import type { Setup, XCtx } from '../ctx'

const GO: Record<Setup, string> = { rev: brief.connect, search: brief.connect, goals: brief.setUp }

export function Lock({ k, x }: { k: Setup; x: XCtx }) {
  return <LockCard kind={k} size="big" go={GO[k]} onGo={() => x.connect(k)} onHow={() => x.how(k)} />
}
