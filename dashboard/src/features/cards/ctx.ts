// What the two cards under the chart read from the dashboard: the numbers it
// has already worked out, and what a click or a hover on a row does.
import type { Bucket, Money, ReportQuery, Result, Row, Site } from '../../lib/api'
import type { Mods } from '../../lib/modules'

export interface CardsCtx {
  site: Site
  query: ReportQuery
  bucket: Bucket
  full: boolean
  shared: boolean
  /** Full's own cards need the signed-in API: not for a shared link. */
  deep: boolean
  loading: boolean
  scrubbing: boolean
  mods: Mods
  money?: Money
  fmtMoney: (minor: number) => string
  /** Rows a list shows. */
  rows: number
  /** The heading of the value column ("So far" while a race runs). */
  soFar?: string
  cur?: Result
  prev?: Result
  dims: (dim: string) => Row[]
  sourceRows: (dim: string) => Row[]
  perDay: (dim: string) => boolean
  trail: string | null
  dimTrail: boolean
  onSourceHover: (key: string | null) => void
  addFilter: (dim: string, value: string) => void
  mapOn: boolean
  goals: Row[]
  revenueDims: Record<string, Row[] | null>
  countryRevenue: Row[]
  attrFirst: boolean
  onAttr: (first: boolean) => void
  onTrackGoal: () => void
  steps: { kind: 'page' | 'goal'; value: string }[]
  onSteps: (s: { kind: 'page' | 'goal'; value: string }[]) => void
  onPickVisitor: (visitor: string) => void
  visitors: number
}
