// What the bounce guide's card and walkthrough share: every word of them, and the read of the guide of one site and period.
// One file, so the first page names one lazy chunk for both.
import { useEffect, useState } from 'react'
import { call } from '../../lib/api'
import { lazyLoad } from '../../lib/lazyLoad'
import { defineCopy } from '../../i18n'
import type { BounceGuide } from '../../lib/apiMore'

export const copy = defineCopy('bounce', {
  label: 'Why visitors leave',
  close: 'Close',
  loading: 'Reading the visits…',
  failed: 'Couldn’t read the visits. Try again in a moment.',
  leave: (usual: string) => `leave after one page · usual ~${usual}`,
  leavePlain: 'leave after one page',
  since: (day: string) => `since ${day}`,
  cardHigh: (tenths: number, usual: number) => `${tenths} in 10 leave after one page (usual ~${usual} in 10)`,
  cardLow: (tenths: number, usual: number) => `Good news: only ${tenths} in 10 leave after one page (usual ~${usual} in 10)`,
  seeWhy: 'See why',
  normal: (usual: string) => `Nothing unusual. About as many leave after one page as usual (~${usual}).`,
  few: (min: number, weeks: number) => `Not enough visits yet to say what’s usual for this site. We compare once it has ${min} visits in a period and in the ${weeks} weeks before.`,
  low: 'Fewer leave after one page than usual. Nothing to fix.',
  spread: 'No single page or source stands out. It is spread over many.',
  ofVisits: (share: string) => `${share} of visits`,
  steps: 'Steps',
  stepOf: (n: number, total: number) => `${n} of ${total}`,
  back: 'Back',
  next: 'Next',
  done: 'Done',
  titles: ['What happened', 'Where they leave', 'Why', 'Fix it'],
  chartLabel: 'Share of visits that leave after one page, by day',
  usualBand: (usual: string) => `usual ~${usual}`,
  now: 'This period',
  usually: 'Usual',
  landingOn: 'Landing on',
  slowOn: 'Slow to load:',
  sourceOn: (source: string, device: string) => `${source} on ${device}`,
  noClick: (rate: string) => `${rate} leave without clicking`,
  fromOn: (source: string, device: string) => `Visitors from ${source} on ${device}`,
  zones: { good: 'Good', slow: 'Slow', poor: 'Poor' },
  secs: (n: string) => `${n} s`,
  showsAfter: (secs: string) => `Main content shows after ${secs}\u00a0s`,
  fix: {
    open: 'Open the page like they do',
    phone: 'Make the window narrow, like a phone',
    see: 'See this page in Data',
    links: 'Link to the next step at the end of the page',
    speed: 'Make it load faster',
    withoutLinks: 'Without links',
    withLinks: 'With links',
  },
  go: { open: 'Open', see: 'See this page', speed: 'See speed details' },
  tick: (line: string) => `Tried: ${line}`,
})

export type GuideState = 'loading' | 'ready' | 'failed'

export function useBounceGuide(site: string, qs: string | null): { guide: BounceGuide | null; state: GuideState } {
  const [got, setGot] = useState<{ key: string; guide: BounceGuide | null } | null>(null)
  const key = qs === null ? '' : site + qs
  useEffect(() => {
    if (qs === null) return
    const ctl = new AbortController()
    // qs: rangeQS(query), or "?days=30" for the last days (All sites). Quiet: a share page may not ask.
    call<BounceGuide>('GET', `/sites/${site}/report/bounce-guide${qs}`, undefined, ctl.signal, true)
      .then((guide) => setGot({ key, guide }))
      .catch(() => !ctl.signal.aborted && setGot({ key, guide: null }))
    return () => ctl.abort()
  }, [site, qs, key])
  if (qs === null || got?.key !== key) return { guide: null, state: 'loading' }
  return got.guide ? { guide: got.guide, state: 'ready' } : { guide: null, state: 'failed' }
}

/** The walkthrough, loaded when it is first opened; one place asks for it, so the first page lists its files once. */
export const GuideModal = lazyLoad(() => import('./BounceGuideModal'))
