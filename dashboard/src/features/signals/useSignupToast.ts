// A signup on the stream is a moment like a sale: the same toast, browser notice and chime, and a row in the bell.
import { useEffect, useMemo } from 'react'
import type { Site, Visit } from '../../lib/api'
import { noteSignups } from './signupMoments'
import { isSignup, signupLine } from './signupLine'
import { useMomentToast } from './useMomentToast'

const tag = (v: Visit) => `signup-${v.ts}-${v.visitor ?? ''}`
const loud = () => true

export function useSignupToast(site: Site, visits: (Visit & { id: number })[], goal: string | undefined) {
  const items = useMemo(() => visits.filter((v) => isSignup(v, goal)), [visits, goal])
  useMomentToast({ items, line: signupLine, tag, loud })
  useEffect(() => {
    noteSignups(
      site.domain,
      items.map((v) => ({ id: `signup:${site.id}:${v.ts}:${v.visitor ?? ''}`, site: site.domain, ts: v.ts, title: signupLine(v), source: v.referrer?.replace(/^www\./, '') })),
    )
  }, [site.id, site.domain, items])
}
