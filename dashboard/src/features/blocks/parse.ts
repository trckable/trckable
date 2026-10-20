// A reply's blocks, checked. The reply came over the network, so every value
// is tested here and a block that does not fit is left out, never half drawn.
import { UNITS, type Amount, type Block, type BlocksReply, type BlockMention, type Period, type RankedRow, type Source } from './types'

type D = Record<string, unknown>
const obj = (v: unknown): D => (v && typeof v === 'object' && !Array.isArray(v) ? (v as D) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '')

const ROWS = 10
const MENTIONS = 8
const INCIDENTS = 20
const SOURCES = ['hn', 'ph', 'news', 'ref']

function amount(d: D): Amount {
  const unit = UNITS.find((u) => u === d.unit) ?? 'count'
  return unit === 'money' ? { unit, currency: str(d.currency, 3) || 'USD', exponent: num(d.exponent) ?? 2 } : { unit }
}

function period(v: unknown): Period | undefined {
  const p = obj(v)
  return str(p.label) ? { from: str(p.from, 32), to: str(p.to, 32), label: str(p.label, 60) } : undefined
}

function source(v: unknown): Source | undefined {
  const s = obj(v)
  if (!str(s.endpoint)) return undefined
  return { endpoint: str(s.endpoint), params: Object.fromEntries(Object.entries(obj(s.params)).map(([k, x]) => [k, str(x, 120)])) }
}

function rows(v: unknown): RankedRow[] {
  return arr(v)
    .slice(0, ROWS)
    .flatMap((x) => {
      const r = obj(x)
      const value = num(r.value)
      const before = num(r.before)
      return value === undefined ? [] : [{ label: str(r.label, 120) || '(none)', value, ...(before === undefined ? {} : { before }) }]
    })
}

function mentions(v: unknown): BlockMention[] {
  return arr(v)
    .slice(0, MENTIONS)
    .flatMap((x) => {
      const m = obj(x)
      const id = num(m.id)
      const posted = num(m.posted_at)
      if (id === undefined || posted === undefined || !SOURCES.includes(str(m.source))) return []
      const out: BlockMention = { id, source: m.source as BlockMention['source'], url: str(m.url, 500), title: str(m.title), posted_at: posted, visitors: num(m.visitors) ?? 0 }
      if (str(m.author)) out.author = str(m.author, 60)
      if (num(m.points)) out.points = num(m.points)
      if (num(m.comments)) out.comments = num(m.comments)
      if (m.front === true) out.front = true
      if (m.kind === 'comment') out.kind = 'comment'
      return [out]
    })
}

function side(v: unknown) {
  const s = obj(v)
  const value = num(s.value)
  return value === undefined ? null : { label: str(s.label, 60), value }
}

function one(raw: unknown): Block | null {
  const b = obj(raw)
  const d = obj(b.data)
  const base = { title: str(b.title, 120), period: period(b.period), source: source(b.source), explore: str(b.explore, 300) || undefined }
  switch (b.type) {
    case 'number': {
      const value = num(d.value)
      return value === undefined ? null : { ...base, type: 'number', data: { ...amount(d), value, previous: num(d.previous), invert: d.invert === true } }
    }
    case 'line': {
      const points = arr(d.points).flatMap((p) => num(p) ?? [])
      const l = arr(d.labels)
      return points.length < 2 ? null : { ...base, type: 'line', data: { ...amount(d), points, ...(l.length === 2 ? { labels: [str(l[0], 30), str(l[1], 30)] as [string, string] } : {}) } }
    }
    case 'ranked':
      return { ...base, type: 'ranked', data: { ...amount(d), rows: rows(d.rows) } }
    case 'incidents': {
      const incidents = arr(d.incidents)
        .slice(0, INCIDENTS)
        .flatMap((x) => {
          const i = obj(x)
          const started = num(i.started_at)
          const kind = (['down', 'quiet'] as const).find((k) => k === i.kind)
          if (started === undefined || !kind) return []
          return [{ id: str(i.id, 64) || String(started), kind, started_at: started, ended_at: num(i.ended_at) ?? null, cause: str(i.cause, 120) }]
        })
      return { ...base, type: 'incidents', data: { incidents, uptime: num(d.uptime) ?? null } }
    }
    case 'mentions':
      return { ...base, type: 'mentions', data: { mentions: mentions(d.mentions) } }
    case 'compare': {
      const current = side(d.current)
      const previous = side(d.previous)
      return current && previous ? { ...base, type: 'compare', data: { ...amount(d), current, previous, invert: d.invert === true } } : null
    }
    default:
      return null
  }
}

/** The blocks of a tool's answer that fit their type, and what the answer says it could not read. */
export function parseBlocks(raw: unknown): BlocksReply {
  const r = obj(raw)
  const blocks = arr(r.blocks).flatMap((b) => one(b) ?? [])
  const missing = str(r.missing, 300)
  return { blocks, ...(missing ? { missing } : {}) }
}
