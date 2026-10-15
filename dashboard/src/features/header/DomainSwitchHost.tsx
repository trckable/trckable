// The domain switcher's way in: its own chunk, fetched only once a site has
// shown two domains or an address filters by one (most sites have neither,
// so none of it is in the first load). Once fetched it stays.
import { lazy, Suspense, useState } from 'react'
import { hostFiltered } from '../../lib/domainSwitch'
import type { DomainSwitchProps } from './DomainSwitch'

const DomainSwitch = lazy(() => import('./DomainSwitch').then((m) => ({ default: m.DomainSwitch })))

export function DomainSwitchHost(p: DomainSwitchProps) {
  const wanted = (p.seen?.length ?? 0) >= 2 || hostFiltered(p.filters)
  const [armed, setArmed] = useState(false)
  if (wanted && !armed) setArmed(true)
  if (!armed) return null
  return (
    <Suspense fallback={null}>
      <DomainSwitch {...p} />
    </Suspense>
  )
}
