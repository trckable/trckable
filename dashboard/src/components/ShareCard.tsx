// Share what the dashboard shows as a picture for a post: a card drawn here,
// in the browser as a post (1200 × 630), a square or a story, in trckable's
// look and the site's colour. Nothing is uploaded: the owner downloads it,
// copies it, or hands it to the phone's share sheet. The owner picks the big
// number and up to three more, and money starts off.
import { Check, Copy, Download, Film, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { GHOST, LINE } from '../brand/logo'
import { fmtDuration, fmtInt, fmtPct } from '../lib/format'
import { Modal } from './Modal'
import { Switch } from './Switch'
import { toast } from './Toast'
import './ShareCard.css'

export type ShareData = {
  domain: string
  name: string
  color?: string
  period: string // "Aug 27 – Sep 25"
  visitors: number
  pageviews: number
  prevVisitors?: number
  prevPageviews?: number
  revenue?: { now: number; prev?: number; fmt: (minor: number) => string }
  series: number[]
  /** The dashboard's own comparison, when it has one: the words ("vs last
   *  year") and the other period's line, drawn dashed like the chart's. */
  compare?: { label: string; series: number[] }
  /** More numbers the owner may add: bounce rate (0–1), visit time (s), the top source and country. */
  bounce?: number
  visitTime?: number
  topSource?: string
  topCountry?: string
  /** A milestone instead of the period: "10,000" · "visitors, all time" · "Reached on Sep 25". */
  milestone?: { value: string; label: string; sub: string }
}

export type Design = 'glow' | 'paper' | 'bold'
const DESIGNS: { id: Design; name: string }[] = [
  { id: 'glow', name: 'Glow' },
  { id: 'paper', name: 'Paper' },
  { id: 'bold', name: 'Bold' },
]


const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const change = (now: number, prev?: number) => (prev && prev > 0 ? (now - prev) / prev : null)
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`

/** A smooth line through the points, fitted into the box. */
function linePath(values: number[], x0: number, y0: number, w: number, h: number, scale?: number) {
  const n = values.length
  if (n < 2) return ''
  const top = scale ?? Math.max(1, ...values)
  const pts = values.map((v, i) => [x0 + (i / (n - 1)) * w, y0 + h - (v / top) * h] as const)
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < n; i++) {
    const [px, py] = pts[i - 1]
    const [x, y] = pts[i]
    const mx = (px + x) / 2
    d += ` C${mx.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

export type Lead = 'visitors' | 'pageviews' | 'revenue'
export type Extra = 'visitors' | 'pageviews' | 'revenue' | 'bounce' | 'time' | 'source' | 'country'
export type Format = 'post' | 'square' | 'story'
export type Look = { lead: Lead; extras: Extra[]; change: boolean; chart: boolean; format: Format }

export const SIZES: Record<Format, { w: number; h: number; name: string }> = {
  post: { w: 1200, h: 630, name: 'Post' },
  square: { w: 1080, h: 1080, name: 'Square' },
  story: { w: 1080, h: 1920, name: 'Story' },
}

export const EXTRA_LABEL: Record<Extra, string> = {
  visitors: 'Visitors',
  pageviews: 'Pageviews',
  revenue: 'Revenue',
  bounce: 'Bounce rate',
  time: 'Visit time',
  source: 'Top source',
  country: 'Top country',
}

const EXTRAS: Extra[] = ['visitors', 'pageviews', 'revenue', 'bounce', 'time', 'source', 'country']

/** The value and its small label for one extra, or null when there is none. */
function extraOf(d: ShareData, e: Extra): { value: string; label: string } | null {
  switch (e) {
    case 'visitors':
      return { value: fmtInt(d.visitors), label: 'visitors' }
    case 'pageviews':
      return { value: fmtInt(d.pageviews), label: 'pageviews' }
    case 'revenue':
      return d.revenue ? { value: d.revenue.fmt(d.revenue.now), label: 'revenue' } : null
    case 'bounce':
      return d.bounce !== undefined ? { value: fmtPct(d.bounce), label: 'bounce rate' } : null
    case 'time':
      return d.visitTime !== undefined ? { value: fmtDuration(d.visitTime), label: 'a visit, on average' } : null
    case 'source':
      return d.topSource ? { value: d.topSource, label: 'top source' } : null
    case 'country':
      return d.topCountry ? { value: d.topCountry, label: 'top country' } : null
  }
}

/** Where each part is at moment `at` of the GIF (0 → 1); 1 is the still card.
 *  The number counts up first, the line draws, then the rest fades in. */
function anim(at: number) {
  const span = (a: number, b: number) => Math.max(0, Math.min(1, (at - a) / (b - a)))
  const out = (x: number) => 1 - (1 - x) ** 3
  return {
    count: out(span(0, 0.6)),
    draw: out(span(0.15, 0.85)),
    ghost: span(0.55, 0.85),
    change: span(0.62, 0.8),
    extra: (i: number) => out(span(0.3 + i * 0.1, 0.5 + i * 0.1)),
  }
}

/** The card, as SVG: the same string is the preview and the picture. With
 *  `at` below 1 it is one frame of the GIF. */
export function cardSvg(d: ShareData, design: Design, look: Look, title: string, at = 1): string {
  const { w: W, h: H } = SIZES[look.format]
  if (d.milestone) return milestoneSvg(d, design, title, W, H, at)
  const a = anim(at)
  const accent = d.color || '#b8ff3c'
  const t =
    design === 'paper'
      ? { bg: '#ffffff', fg: '#15161a', mute: '#6b7280', line: '#e7e7ea', acc: d.color || '#4d7c0f' }
      : design === 'bold'
        ? { bg: accent, fg: '#0b0d10', mute: 'rgba(11,13,16,0.62)', line: 'rgba(11,13,16,0.16)', acc: '#0b0d10' }
        : { bg: '#0b0d10', fg: '#f5f7fa', mute: '#8a93a1', line: '#1d2229', acc: accent }
  const font = `font-family="Geist, Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"`
  const lead =
    look.lead === 'revenue' && d.revenue
      ? { value: d.revenue.fmt(Math.round(d.revenue.now * a.count)), label: 'revenue', ch: change(d.revenue.now, d.revenue.prev) }
      : look.lead === 'pageviews'
        ? { value: fmtInt(Math.round(d.pageviews * a.count)), label: 'pageviews', ch: change(d.pageviews, d.prevPageviews) }
        : { value: fmtInt(Math.round(d.visitors * a.count)), label: 'visitors', ch: change(d.visitors, d.prevVisitors) }
  const extras = EXTRAS.filter((e) => look.extras.includes(e) && e !== look.lead)
    .map((e) => extraOf(d, e))
    .filter((x): x is { value: string; label: string } => !!x)
    .slice(0, 3)
  const vsText = d.compare?.label ?? 'vs the period before'
  const changeLine =
    look.change && d.compare
      ? lead.ch !== null
        ? `<tspan fill-opacity="${a.change}">  ·  </tspan><tspan fill="${t.acc}" fill-opacity="${a.change}" font-weight="700">${pct(lead.ch)}</tspan><tspan fill="${t.mute}" fill-opacity="${a.change}"> ${esc(vsText)}</tspan>`
        : `<tspan fill="${t.mute}" fill-opacity="${a.change}">  ·  no data ${esc(vsText.replace(/^vs /, 'from '))}</tspan>`
      : ''

  // Where each part goes, by size.
  const L =
    look.format === 'post'
      ? { pad: 60, title: 92, period: 132, big: 290, bigSize: 150, label: 340, chartTop: 410, chartH: 130, foot: H - 26, extras: 'column' as const, exTop: 210 }
      : look.format === 'square'
        ? { pad: 72, title: 120, period: 164, big: 420, bigSize: 190, label: 480, chartTop: 700, chartH: 220, foot: H - 44, extras: 'row' as const, exTop: 600 }
        : { pad: 80, title: 220, period: 270, big: 760, bigSize: 230, label: 840, chartTop: 1450, chartH: 250, foot: H - 80, extras: 'stack' as const, exTop: 1010 }
  const top = Math.max(1, ...d.series, ...(d.compare?.series ?? []))
  const chartBottom = L.chartTop + L.chartH
  const chart = look.chart && d.series.length > 1 ? linePath(d.series.map((v) => v / top), L.pad, L.chartTop, W - L.pad * 2, L.chartH, 1) : ''
  const ghostLine = look.chart && look.change && d.compare && d.compare.series.some((v) => v > 0) ? linePath(d.compare.series.map((v) => v / top), L.pad, L.chartTop, W - L.pad * 2, L.chartH, 1) : ''

  // A long value ("United Kingdom") shrinks to its room instead of running
  // into the next one; Geist's figures and letters average about 0.58 em.
  const fit = (text: string, size: number, room: number) => Math.min(size, Math.floor(room / (text.length * 0.58)))
  const exSvg = extras
    .map((x, i) => `<g opacity="${a.extra(i)}" transform="translate(0 ${(1 - a.extra(i)) * 14})">` + exOne(x, i) + '</g>')
    .join('')
  function exOne(x: { value: string; label: string }, i: number) {
      if (L.extras === 'column')
        return (
          `<text x="${W - L.pad}" y="${L.exTop + i * 86}" text-anchor="end" ${font} font-size="${fit(x.value, 48, 420)}" font-weight="700" fill="${t.fg}">${esc(x.value)}</text>` +
          `<text x="${W - L.pad}" y="${L.exTop + 32 + i * 86}" text-anchor="end" ${font} font-size="22" fill="${t.mute}">${esc(x.label)}</text>`
        )
      if (L.extras === 'row') {
        const colW = (W - L.pad * 2) / 3
        const x0 = L.pad + i * colW
        return (
          `<text x="${x0}" y="${L.exTop}" ${font} font-size="${fit(x.value, 50, colW - 24)}" font-weight="700" fill="${t.fg}">${esc(x.value)}</text>` +
          `<text x="${x0}" y="${L.exTop + 36}" ${font} font-size="26" fill="${t.mute}">${esc(x.label)}</text>`
        )
      }
      return (
        `<text x="${L.pad}" y="${L.exTop + i * 150}" ${font} font-size="${fit(x.value, 84, W - L.pad * 2)}" font-weight="700" letter-spacing="-2" fill="${t.fg}">${esc(x.value)}</text>` +
        `<text x="${L.pad + 2}" y="${L.exTop + 46 + i * 150}" ${font} font-size="32" fill="${t.mute}">${esc(x.label)}</text>`
      )
  }

  const glow =
    design === 'glow'
      ? `<radialGradient id="g" cx="0.15" cy="0" r="0.9"><stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#g)"/>`
      : ''
  const s = look.format === 'post' ? 1 : 1.25 // the footer grows with the canvas

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.acc}" stop-opacity="0.35"/><stop offset="1" stop-color="${t.acc}" stop-opacity="0"/></linearGradient>` +
    // The line draws itself from the left in the GIF; a still card shows it all.
    `<clipPath id="draw"><rect x="0" y="0" width="${L.pad + (W - L.pad * 2) * a.draw + 8}" height="${H}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>` +
    glow +
    `<text x="${L.pad}" y="${L.title}" ${font} font-size="${30 * s}" font-weight="600" fill="${t.fg}">${esc(title)}</text>` +
    `<text x="${L.pad}" y="${L.period}" ${font} font-size="${24 * s}" fill="${t.mute}">${esc(d.period)}</text>` +
    `<text x="${L.pad - 4}" y="${L.big}" ${font} font-size="${L.bigSize}" font-weight="760" letter-spacing="-6" fill="${t.fg}">${esc(lead.value)}</text>` +
    `<text x="${L.pad + 2}" y="${L.label}" ${font} font-size="${30 * s}" fill="${t.mute}">${lead.label}${changeLine}</text>` +
    exSvg +
    (ghostLine ? `<path d="${ghostLine}" fill="none" stroke="${t.mute}" stroke-width="3" stroke-dasharray="10 9" stroke-linecap="round" opacity="${0.8 * a.ghost}"/>` : '') +
    (chart
      ? `<g clip-path="url(#draw)"><path d="${chart} L${W - L.pad} ${chartBottom} L${L.pad} ${chartBottom} Z" fill="url(#a)"/><path d="${chart}" fill="none" stroke="${t.acc}" stroke-width="${5 * s}" stroke-linecap="round" stroke-linejoin="round"/></g>`
      : '') +
    `<line x1="${L.pad}" y1="${L.foot - 42 * s}" x2="${W - L.pad}" y2="${L.foot - 42 * s}" stroke="${t.line}" stroke-width="2"/>` +
    brandFoot(L.pad, L.foot, s, t) +
    `<text x="${W - L.pad}" y="${L.foot}" text-anchor="end" ${font} font-size="${22 * s}" fill="${t.mute}">${esc(d.domain)}</text>` +
    `</svg>`
  )
}

/** The ghost on its own dark badge (as the app icon is) and "Counted by
 *  trckable", with the baseline at y. */
function brandFoot(x: number, y: number, s: number, t: { fg: string; mute: string }) {
  const font = `font-family="Geist, Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"`
  const b = 38 * s
  return (
    `<rect x="${x}" y="${y - b + 8 * s}" width="${b}" height="${b}" rx="${10 * s}" fill="#0b0d10"/>` +
    `<g transform="translate(${x + 4 * s} ${y - b + 12 * s}) scale(${0.47 * s})">` +
    `<path d="${GHOST}" fill="#b8ff3c"/><circle cx="25.5" cy="29" r="3.6" fill="#0b0d10"/><circle cx="38.5" cy="29" r="3.6" fill="#0b0d10"/>` +
    `<path d="${LINE}" fill="none" stroke="#0b0d10" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${LINE}" fill="none" stroke="#f5f7fa" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>` +
    `<text x="${x + b + 14 * s}" y="${y}" ${font} font-size="${22 * s}" fill="${t.mute}">Counted by <tspan font-weight="760" fill="${t.fg}" letter-spacing="-1">trck</tspan><tspan font-weight="360" letter-spacing="-0.5">able</tspan></text>`
  )
}

/** A milestone card: one big number, what it is, the day, and a burst. */
function milestoneSvg(d: ShareData, design: Design, title: string, W: number, H: number, at: number): string {
  const m = d.milestone!
  const a = anim(at)
  // "10,000" counts up; a value that is not a plain number (a date) just appears.
  const plain = /^[\d,]+$/.test(m.value)
  const value = plain && at < 1 ? fmtInt(Math.round(Number(m.value.replace(/,/g, '')) * a.count)) : m.value
  const accent = d.color || '#b8ff3c'
  const t =
    design === 'paper'
      ? { bg: '#ffffff', fg: '#15161a', mute: '#6b7280', acc: d.color || '#4d7c0f' }
      : design === 'bold'
        ? { bg: accent, fg: '#0b0d10', mute: 'rgba(11,13,16,0.62)', acc: '#0b0d10' }
        : { bg: '#0b0d10', fg: '#f5f7fa', mute: '#8a93a1', acc: accent }
  const font = `font-family="Geist, Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"`
  const s = W === 1200 ? 1 : 1.3
  const cy = H * 0.52
  // A burst of dots around the number, placed by fractions of the canvas so
  // it is the same every time and on every size.
  const dots = [
    [0.12, 0.27, 9], [0.19, 0.19, 5], [0.86, 0.24, 8], [0.8, 0.17, 5], [0.9, 0.41, 6], [0.1, 0.52, 6],
    [0.84, 0.6, 10], [0.17, 0.68, 5], [0.73, 0.75, 6], [0.27, 0.79, 7], [0.63, 0.21, 4], [0.35, 0.17, 4],
  ]
    .map(([x, y, r], i) => `<circle cx="${x * W}" cy="${y * H}" r="${r * s * a.extra(i % 4)}" fill="${i % 3 === 0 ? t.acc : t.mute}" opacity="${i % 2 ? 0.5 : 0.85}"/>`)
    .join('')
  const glow =
    design === 'glow'
      ? `<radialGradient id="g" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.3"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#g)"/>`
      : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>` +
    glow +
    dots +
    `<text x="${W / 2}" y="${cy - 210 * s}" text-anchor="middle" ${font} font-size="${28 * s}" font-weight="600" fill="${t.fg}">${esc(title)}</text>` +
    `<text x="${W / 2}" y="${cy}" text-anchor="middle" ${font} font-size="${170 * s}" font-weight="760" letter-spacing="-6" fill="${t.fg}">${esc(value)}</text>` +
    `<text x="${W / 2}" y="${cy + 66 * s}" text-anchor="middle" ${font} font-size="${38 * s}" font-weight="600" fill="${t.acc}" fill-opacity="${a.change}">${esc(m.label)}</text>` +
    `<text x="${W / 2}" y="${cy + 116 * s}" text-anchor="middle" ${font} font-size="${24 * s}" fill="${t.mute}" fill-opacity="${a.change}">${esc(m.sub)}</text>` +
    brandFoot(60 * s, H - 40 * s, s, t) +
    `<text x="${W - 60 * s}" y="${H - 40 * s}" text-anchor="end" ${font} font-size="${22 * s}" fill="${t.mute}">${esc(d.domain)}</text>` +
    `</svg>`
  )
}

/** The card as a PNG, at twice the size so it stays sharp on phones. */
async function toPng(svg: string, W: number, H: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok()
      img.onerror = () => bad(new Error('The card could not be drawn in this browser.'))
      img.src = url
    })
    const c = document.createElement('canvas')
    c.width = W * 2
    c.height = H * 2
    const ctx = c.getContext('2d')!
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0, W, H)
    return await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('The card could not be made.'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

const LEADS: { id: Lead; name: string }[] = [
  { id: 'visitors', name: 'Visitors' },
  { id: 'pageviews', name: 'Pageviews' },
  { id: 'revenue', name: 'Revenue' },
]
const MAX_EXTRAS = 3

export default function ShareCard({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const [design, setDesign] = useState<Design>('glow')
  // Money starts off: it is the owner's to put in, never a default.
  const [look, setLook] = useState<Look>({ lead: 'visitors', extras: ['pageviews', 'source'], change: true, chart: true, format: 'post' })
  const [title, setTitle] = useState(data.name || data.domain)
  const [busy, setBusy] = useState<string | null>(null)
  const [gifAt, setGifAt] = useState(0)
  const [done, setDone] = useState<string | null>(null)
  const size = SIZES[look.format]
  const svg = useMemo(() => cardSvg(data, design, look, title), [data, design, look, title])
  const src = useMemo(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), [svg])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 1800)
    return () => clearTimeout(t)
  }, [done])

  const lead =
    look.lead === 'revenue' && data.revenue
      ? { text: `${data.revenue.fmt(data.revenue.now)} revenue`, ch: change(data.revenue.now, data.revenue.prev) }
      : look.lead === 'pageviews'
        ? { text: `${fmtInt(data.pageviews)} pageviews`, ch: change(data.pageviews, data.prevPageviews) }
        : { text: `${fmtInt(data.visitors)} visitors`, ch: change(data.visitors, data.prevVisitors) }
  const post = data.milestone
    ? `${title}: ${data.milestone.value} ${data.milestone.label}. ${data.milestone.sub}. Counted by trckable — trckable.com`
    : `${title}: ${lead.text}, ${data.period}${look.change && data.compare && lead.ch !== null ? ` (${pct(lead.ch)} ${data.compare.label})` : ''}. Counted by trckable — trckable.com`
  const file = () => `trckable-${data.domain}-${look.format}-${new Date().toISOString().slice(0, 10)}.png`
  const act = async (what: string, run: (png: Blob) => Promise<unknown>) => {
    setBusy(what)
    try {
      await run(await toPng(svg, size.w, size.h))
      setDone(what)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(null)
    }
  }
  const canShare = typeof navigator.canShare === 'function'
  const save = (blob: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  // The GIF is drawn frame by frame here; its encoder is its own chunk,
  // fetched the first time this is pressed.
  const makeGif = async () => {
    setBusy('gif')
    setGifAt(0)
    try {
      const { cardGif } = await import('./ShareGif')
      save(await cardGif(data, design, look, title, setGifAt), file().replace(/\.png$/, '.gif'))
      setDone('gif')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(null)
    }
  }
  const has = (e: Extra) => e !== look.lead && extraOf(data, e) !== null
  const extras = look.extras.filter(has)
  const flip = (e: Extra) =>
    setLook((l) => ({ ...l, extras: l.extras.includes(e) ? l.extras.filter((x) => x !== e) : [...l.extras.filter(has), e].slice(-MAX_EXTRAS) }))

  return (
    <Modal label="Share these numbers" className="share-modal" onClose={onClose}>
      <div className="modal-head">
        <span className="modal-badge" aria-hidden="true">
          <Share2 size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>Share these numbers</h2>
          <span className="faint">A picture for a post, made in this browser. Nothing is uploaded, and only what you pick is in it.</span>
        </div>
        <button type="button" className="btn icon close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="share-body">
        <div className="share-preview">
          <img key={look.format} src={src} alt={`The card: ${post}`} className={'is-' + look.format} style={{ aspectRatio: `${size.w} / ${size.h}` }} />
        </div>
        <div className="share-options">
          <div className="share-row">
            <span className="share-label">Look</span>
            <div className="share-designs seg" role="group" aria-label="Design">
              {DESIGNS.map((x) => (
                <button key={x.id} type="button" aria-pressed={design === x.id} onClick={() => setDesign(x.id)}>
                  {x.name}
                </button>
              ))}
            </div>
          </div>
          <div className="share-row">
            <span className="share-label">Size</span>
            <div className="share-designs seg" role="group" aria-label="Size">
              {(Object.keys(SIZES) as Format[]).map((f) => (
                <button key={f} type="button" aria-pressed={look.format === f} title={`${SIZES[f].w} × ${SIZES[f].h}`} onClick={() => setLook((l) => ({ ...l, format: f }))}>
                  <span className={'share-shape is-' + f} aria-hidden="true" />
                  {SIZES[f].name}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            Title
            <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {!data.milestone && (
            <>
              <div className="share-row">
                <span className="share-label">Big number</span>
                <div className="share-designs seg" role="group" aria-label="Big number">
                  {LEADS.filter((x) => x.id !== 'revenue' || data.revenue).map((x) => (
                    <button key={x.id} type="button" aria-pressed={look.lead === x.id} onClick={() => setLook((l) => ({ ...l, lead: x.id }))}>
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="share-row">
                <span className="share-label">
                  Also show <span className="faint">{extras.length} of {MAX_EXTRAS}</span>
                </span>
                <div className="share-chips" role="group" aria-label="Also show">
                  {EXTRAS.filter(has).map((e) => {
                    const on = extras.includes(e)
                    return (
                      <button key={e} type="button" className={'share-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => flip(e)}>
                        {on && <Check size={13} strokeWidth={2.4} aria-hidden="true" />}
                        {EXTRA_LABEL[e]}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="share-toggles">
                {data.compare && (
                  <label className="share-toggle">
                    <span>Change {data.compare.label}</span>
                    <Switch on={look.change} label="Change" onChange={() => setLook((l) => ({ ...l, change: !l.change }))} />
                  </label>
                )}
                <label className="share-toggle">
                  <span>The chart</span>
                  <Switch on={look.chart} label="The chart" onChange={() => setLook((l) => ({ ...l, chart: !l.chart }))} />
                </label>
              </div>
            </>
          )}
          <div className="share-actions">
            <button
              type="button"
              className="btn primary big"
              disabled={!!busy}
              onClick={() =>
                act('download', async (png) => save(png, file()))
              }
            >
              {busy === 'download' ? <span className="btn-spin" aria-hidden="true" /> : done === 'download' ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Download size={16} strokeWidth={1.75} aria-hidden="true" />}
              {done === 'download' ? 'Saved' : 'Download'}
            </button>
            <div className="share-pair">
            <button
              type="button"
              className="btn"
              disabled={!!busy || typeof ClipboardItem === 'undefined'}
              onClick={() => act('copy', (png) => navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]))}
            >
              {busy === 'copy' ? <span className="btn-spin" aria-hidden="true" /> : done === 'copy' ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.75} aria-hidden="true" />}
              {done === 'copy' ? 'Copied' : 'Copy image'}
            </button>
            <button
              type="button"
              className={'btn share-gif' + (busy === 'gif' ? ' making' : '')}
              disabled={!!busy}
              style={{ '--p': gifAt } as CSSProperties}
              title="The same card, animated: the number counts up and the line draws itself"
              onClick={makeGif}
              aria-live="polite"
            >
              {done === 'gif' ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Film size={16} strokeWidth={1.75} aria-hidden="true" />}
              <span>{busy === 'gif' ? `GIF ${Math.round(gifAt * 100)}%` : done === 'gif' ? 'Saved' : 'GIF'}</span>
            </button>
            </div>
            {canShare && (
              <button
                type="button"
                className="btn"
                disabled={!!busy}
                onClick={() =>
                  act('share', async (png) => {
                    const f = new File([png], file(), { type: 'image/png' })
                    if (!navigator.canShare({ files: [f] })) throw new Error('This browser cannot share pictures: download it instead.')
                    await navigator.share({ files: [f], text: post })
                  })
                }
              >
                <Share2 size={16} strokeWidth={1.75} aria-hidden="true" />
                Share…
              </button>
            )}
          </div>
          <button type="button" className="linkish share-post" onClick={() => navigator.clipboard?.writeText(post).then(() => toast('Post text copied'))}>
            Copy the text for the post
          </button>
        </div>
      </div>
    </Modal>
  )
}
