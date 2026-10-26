import type { Compare } from '../briefing/compare'
import type { Filter } from '../../lib/api'

// What Explore draws. Each section reads one of these, made from the API's answers (data/).

/** Against the usual: above it, below it, or inside it. */
export type Tone = '' | 'up' | 'dn'

/** One row of a table of people: its filter value, its name, how many now, how many usually, and which way it went. */
export interface Row {
  val: string
  name: string
  /** The shorter name a filter chip says ("HN"). */
  short?: string
  /** Country code, where the row is a country (the flag comes from it). */
  code?: string
  v: number
  c: number
  st: Tone
  /** Customers and attributed revenue (minor units) from this row, where payments are connected. */
  cust?: number
  rev?: number
}

/** A number, the range it usually sits in, and where it is now. */
export interface Stat {
  v: number
  c: number
  lo: number
  hi: number
  st: Tone
}

/** A card with a line behind its number. */
export interface Kc {
  icon: string
  label: string
  val: string
  unit?: string
  note: { c: string; t: string }
  vals: number[]
  lo?: number
  hi?: number
  col?: string
  st: Tone
}

/** A card without a line: a name, a tag, a number and the usual under it. */
export interface Xkc {
  icon: string
  label: string
  val: string
  unit?: string
  tag: string
  tone: Tone
  detail: string
}

export interface Shape {
  pts: number[]
  x: [string, string, string]
  /** What each point is called on hover: "Oct 6", "Oct 6 14:00". */
  names: string[]
  /** The period before, bucket for bucket; none when it has too little behind it to draw. */
  before: Compare | null
  /** Why the comparison draws nothing when it was asked for and the period before has too little behind it. */
  why: string | null
}

export interface Down {
  from: string
  to: string
  min: number
}

export interface Overview {
  kcs: Kc[]
  /** What the shape counts: "hour", "6 hours" or "day". */
  per: string
  shape: Shape | null
  down: Down[]
  pages: Row[]
  sources: Row[]
  /** The people of the period: the whole a row's share is a share of. */
  of: number
}

export interface Table {
  rows: Row[]
  /** The people of the period: the whole a row's share is a share of. */
  of: number
  /** The filter a tapped row sets, where the rows are not the table's usual kind (a channel, not a source). */
  dim?: string
}

export interface SearchRow {
  name: string
  clicks: number
  impr: number
  ctr: number
  pos: number
  fresh?: boolean
}

export interface Search {
  /** Search Console is connected. */
  on: boolean
  /** There is enough Google traffic to say anything. */
  enough: boolean
  kcs: Xkc[]
  queries: SearchRow[]
  pages: SearchRow[]
}

export interface Sale {
  kind: 'new' | 'upgrade' | 'renewal' | 'refund'
  label: string
  from: string
  country: string
  device: string
  when: string
  /** Net, in minor units (a refund is negative). */
  amt: number
}

export interface Sales {
  /** What the section can say: no payments connected, nothing to sell here, or the list. */
  state: 'connect' | 'none' | 'ok'
  sales: Sale[]
}

export interface Step {
  name: string
  v: number
  c: number
}

export interface Goal extends Stat {
  name: string
}

export interface Funnel {
  steps: Step[]
  /** The pages and goals the funnel counts, in order (the payment step left out): what saving it keeps. */
  spec: { kind: 'page' | 'goal'; value: string }[]

  /** Where people leave more than usual: the step's index (-1 for none), the share who go on, and the usual share. */
  leak: { at: number; r: number; ur: number }
  goals: Goal[]
  /** The period's words for the goals' usual ("vs usual Friday"). */
  vs: string
  /** The last step (paid) cannot be told until payments are connected. */
  ghost: boolean
  /** Goals are set up. */
  goalsOn: boolean
  /** Pages that can be added as a step or a goal, with how many people saw each. */
  pages: (Stat & { name: string })[]
}

export type Grade = 'good' | 'mid' | 'poor'

export interface SlowPage {
  name: string
  v: number
  val: string
  grade: Grade
}

export interface Speed {
  kcs: Xkc[]
  pages: SlowPage[]
  /** Loading time by kind of device, once there are enough views on it. */
  devices: SlowPage[]
}

export interface Mention {
  title: string
  src: string
  /** Hacker News points and comments; null where the place does not count them. */
  pts: number | null
  cm: number | null
  when: string
}

export interface Bot {
  name: string
  count: number
}

/** The values a filter can take, as menus list them. */
export interface Option {
  val: string
  name: string
  short?: string
}

export type FilterDim = 'referrer' | 'page' | 'country' | 'device'

export interface Connected {
  rev: boolean
  search: boolean
  goals: boolean
}

/** Tables that bring their own numbers: the cards the old Full page had, each opened by its section as it was. */
export type HostedTab = 'highlights' | 'overtime' | 'hours' | 'revmap' | 'earners' | 'sells' | 'people' | 'buyers' | 'retention' | 'vsale' | 'toconvert' | 'flow' | 'ai' | 'answers'

/** The breakdowns only the deep report has: where people left, regions and cities, the parts of a campaign, language, browser version, screen width, page groups. */
export type DeepTab = 'exits' | 'groups' | 'regions' | 'cities' | 'utmsource' | 'medium' | 'bversion' | 'screens' | 'languages'

export type Tab = HostedTab | DeepTab | 'overview' | 'pages' | 'sources' | 'referrers' | 'utm' | 'search' | 'countries' | 'devices' | 'browsers' | 'funnels' | 'sales' | 'speed' | 'mentions' | 'outbound' | 'bots'

export type Section = 'overview' | 'pages' | 'sources' | 'places' | 'tech' | 'results' | 'sales' | 'speed' | 'mentions' | 'links' | 'ai' | 'answers'

/** Every section's answer for one site, period and set of filters. */
export interface Tabs {
  overview: Overview
  pages: Table
  sources: Table
  referrers: Table
  utm: Table
  browsers: Table
  countries: Table
  devices: Table
  outbound: Table
  exits: Table
  groups: Table
  regions: Table
  cities: Table
  utmsource: Table
  medium: Table
  bversion: Table
  screens: Table
  languages: Table
  bots: Bot[]
  search: Search
  funnels: Funnel
  sales: Sales
  speed: Speed
  mentions: Mention[]
  highlights: null
  overtime: null
  hours: null
  revmap: null
  earners: null
  sells: null
  people: null
  buyers: null
  retention: null
  vsale: null
  toconvert: null
  flow: null
  ai: null
  answers: null
}

export interface SavedView {
  id?: string
  name: string
  filters: Filter[]
}
