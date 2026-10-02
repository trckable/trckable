// What is worth saying since the last visit: the moments and the findings of
// the window from then to today (the markers' own sources), ranked
// (today.ts). Asked for once the page is quiet. null until the server has
// answered; a failure is nothing to say, never an error.
import { useEffect, useState } from 'react'
import { fmtMoney } from '../../lib/format'
import type { ISODate } from '../../lib/dates'
import { extrasApi } from '../extras/extrasApi'
import { whenQuiet } from '../extras/quiet'
import { momentsApi } from './api'
import { pickToday, windowOf } from './today'
import { pinsFromInsights, pinsFromMoments, type Pin } from './pins'

export interface Today {
  items: Pin[]
  money: (minor: number) => string
}

export function useOneThing(site: string, since: ISODate | undefined, today: ISODate, told: string[]): Today | null {
  const [found, setFound] = useState<{ key: string; today: Today } | null>(null)
  const key = [site, since ?? '', today].join('|')
  useEffect(() => {
    const ctl = new AbortController()
    const q = windowOf(since, today)
    const cancel = whenQuiet(() => {
      void Promise.all([momentsApi.moments(site, q, 'day', ctl.signal).catch(() => null), extrasApi.insights(site, q).catch(() => null)]).then(([m, i]) => {
        if (ctl.signal.aborted) return
        const pins = [...pinsFromMoments(m?.moments ?? [], true), ...pinsFromInsights(i?.insights ?? [])]
        const currency = m?.currency
        const money = (minor: number) => (currency ? fmtMoney(minor, currency, m?.exponent ?? 2) : '')
        setFound({ key, today: { items: pickToday(pins, since, told), money } })
      })
    })
    return () => {
      cancel()
      ctl.abort()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: told is a new array each render
  return found && found.key === key ? found.today : null
}
