// The new cards' words (try-out).
import { fmtInt, fmtPct } from '../../lib/format'

export const newCopy = {
  up: '▲',
  down: '▼',
  flat: '–',
  share: (pct: string) => pct,
  revenue: 'Revenue',
  retention: {
    title: 'Retention',
    arrived: 'Arrived',
    people: 'Visitors',
    week: (k: number) => `Week ${k}`,
    open: '·',
    inProgress: 'in progress',
    cell: (back: number, size: number) => `${fmtInt(back)} of ${fmtInt(size)} came back`,
    nextWeek: (share: number) => `${fmtPct(share)} came back the next week`,
    none: 'Not enough history yet',
    failed: 'Couldn’t read retention',
    curve: (weeks: number) => `Share who came back, weeks 1 to ${weeks}`,
    low: 'fewer',
    high: 'more',
  },
  funnel: {
    made: (share: number) => `${fmtPct(share)} made it`,
    median: (t: string) => `${t} median`,
    typical: (t: string) => `${t} typical`,
    lost: (pct: number, left: string) => `−${pct}% · ${left} left here`,
    steps: 'Steps',
  },
  people: {
    title: 'People',
    online: (n: number) => `${fmtInt(n)} online`,
    pages: (n: number, time: string) => `${fmtInt(n)} ${n === 1 ? 'page' : 'pages'} · ${time}`,
    goal: 'goal',
    none: 'No visits recorded yet.',
    open: 'See this visitor’s whole journey',
  },
}
