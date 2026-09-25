// Share what the dashboard shows as a picture for a post: a card drawn here,
// in the browser, 1200 × 630 (what social sites show), in trckable's look
// and the site's colour. Nothing is uploaded: the owner downloads it, copies
// it, or hands it to the phone's share sheet. Every number is a switch, and
// money starts off.
import { Check, Copy, Download, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GHOST, LINE } from '../brand/logo'
import { fmtInt } from '../lib/format'
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
}

type Design = 'glow' | 'paper' | 'bold'
const DESIGNS: { id: Design; name: string }[] = [
  { id: 'glow', name: 'Glow' },
  { id: 'paper', name: 'Paper' },
  { id: 'bold', name: 'Bold' },
]

const W = 1200
const H = 630

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const change = (now: number, prev?: number) => (prev && prev > 0 ? (now - prev) / prev : null)
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`

/** A smooth line through the points, fitted into the box. */
function linePath(values: number[], x0: number, y0: number, w: number, h: number) {
  const n = values.length
  if (n < 2) return ''
  const top = Math.max(1, ...values)
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

type Show = { visitors: boolean; pageviews: boolean; revenue: boolean; change: boolean; chart: boolean }

/** The card, as SVG: the same string is the preview and the picture. */
export function cardSvg(d: ShareData, design: Design, show: Show, title: string): string {
  const accent = d.color || '#b8ff3c'
  const t =
    design === 'paper'
      ? { bg: '#ffffff', fg: '#15161a', mute: '#6b7280', line: '#e7e7ea', acc: d.color || '#4d7c0f', ghostEye: '#0b0d10' }
      : design === 'bold'
        ? { bg: accent, fg: '#0b0d10', mute: 'rgba(11,13,16,0.62)', line: 'rgba(11,13,16,0.16)', acc: '#0b0d10', ghostEye: accent }
        : { bg: '#0b0d10', fg: '#f5f7fa', mute: '#8a93a1', line: '#1d2229', acc: accent, ghostEye: '#0b0d10' }
  const font = `font-family="Geist, Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"`
  const main = show.visitors
    ? { value: fmtInt(d.visitors), label: 'visitors', ch: change(d.visitors, d.prevVisitors) }
    : show.pageviews
      ? { value: fmtInt(d.pageviews), label: 'pageviews', ch: change(d.pageviews, d.prevPageviews) }
      : show.revenue && d.revenue
        ? { value: d.revenue.fmt(d.revenue.now), label: 'revenue', ch: change(d.revenue.now, d.revenue.prev) }
        : null
  const side: { value: string; label: string }[] = []
  if (show.visitors && show.pageviews) side.push({ value: fmtInt(d.pageviews), label: 'pageviews' })
  if (show.revenue && d.revenue && (show.visitors || show.pageviews)) side.push({ value: d.revenue.fmt(d.revenue.now), label: 'revenue' })

  const chart = show.chart && d.series.length > 1 ? linePath(d.series, 60, 420, W - 120, 130) : ''
  const glow =
    design === 'glow'
      ? `<radialGradient id="g" cx="0.15" cy="0" r="0.9"><stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#g)"/>`
      : ''
  const ghost =
    `<g transform="translate(60 548) scale(0.72)">` +
    `<path d="${GHOST}" fill="${design === 'bold' ? '#0b0d10' : '#b8ff3c'}"/>` +
    `<circle cx="25.5" cy="29" r="3.6" fill="${t.ghostEye}"/><circle cx="38.5" cy="29" r="3.6" fill="${t.ghostEye}"/>` +
    `<path d="${LINE}" fill="none" stroke="${t.bg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${LINE}" fill="none" stroke="${t.fg}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.acc}" stop-opacity="0.35"/><stop offset="1" stop-color="${t.acc}" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>` +
    glow +
    `<text x="60" y="92" ${font} font-size="30" font-weight="600" fill="${t.fg}">${esc(title)}</text>` +
    `<text x="60" y="132" ${font} font-size="24" fill="${t.mute}">${esc(d.period)}</text>` +
    (main
      ? `<text x="56" y="290" ${font} font-size="150" font-weight="760" letter-spacing="-6" fill="${t.fg}">${esc(main.value)}</text>` +
        `<text x="62" y="340" ${font} font-size="30" fill="${t.mute}">${main.label}${show.change && main.ch !== null ? `  ·  <tspan fill="${t.acc}" font-weight="700">${pct(main.ch)}</tspan><tspan fill="${t.mute}"> vs the period before</tspan>` : ''}</text>`
      : '') +
    side
      .map(
        (s, i) =>
          `<text x="${W - 60}" y="${210 + i * 90}" text-anchor="end" ${font} font-size="52" font-weight="700" fill="${t.fg}">${esc(s.value)}</text>` +
          `<text x="${W - 60}" y="${244 + i * 90}" text-anchor="end" ${font} font-size="22" fill="${t.mute}">${s.label}</text>`,
      )
      .join('') +
    (chart
      ? `<path d="${chart} L${W - 60} 550 L60 550 Z" fill="url(#a)"/><path d="${chart}" fill="none" stroke="${t.acc}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
      : '') +
    `<line x1="60" y1="572" x2="${W - 60}" y2="572" stroke="${t.line}" stroke-width="2"/>` +
    ghost +
    `<text x="112" y="596" ${font} font-size="22" fill="${t.mute}">Counted by <tspan font-weight="760" fill="${t.fg}" letter-spacing="-1">trck</tspan><tspan font-weight="360" letter-spacing="-0.5">able</tspan></text>` +
    `<text x="${W - 60}" y="596" text-anchor="end" ${font} font-size="22" fill="${t.mute}">${esc(d.domain)}</text>` +
    `</svg>`
  )
}

/** The card as a PNG, at twice the size so it stays sharp on phones. */
async function toPng(svg: string): Promise<Blob> {
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

export default function ShareCard({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const [design, setDesign] = useState<Design>('glow')
  const [show, setShow] = useState<Show>({ visitors: true, pageviews: true, revenue: false, change: true, chart: true })
  const [title, setTitle] = useState(data.name || data.domain)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const svg = useMemo(() => cardSvg(data, design, show, title), [data, design, show, title])
  const src = useMemo(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), [svg])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 1800)
    return () => clearTimeout(t)
  }, [done])

  const vch = change(data.visitors, data.prevVisitors)
  const post = `${title}: ${fmtInt(data.visitors)} visitors, ${data.period}${show.change && vch !== null ? ` (${pct(vch)})` : ''}. Counted by trckable — trckable.com`
  const file = () => `trckable-${data.domain}-${new Date().toISOString().slice(0, 10)}.png`
  const act = async (what: string, run: (png: Blob) => Promise<unknown>) => {
    setBusy(what)
    try {
      await run(await toPng(svg))
      setDone(what)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(null)
    }
  }
  const canShare = typeof navigator.canShare === 'function'
  const toggles: { id: keyof Show; label: string; off?: boolean }[] = [
    { id: 'visitors', label: 'Visitors' },
    { id: 'pageviews', label: 'Pageviews' },
    { id: 'revenue', label: 'Revenue', off: !data.revenue },
    { id: 'change', label: 'Change vs the period before', off: data.prevVisitors === undefined },
    { id: 'chart', label: 'The chart' },
  ]

  return (
    <Modal label="Share these numbers" className="share-modal" onClose={onClose}>
      <div className="modal-head">
        <span className="modal-badge" aria-hidden="true">
          <Share2 size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>Share these numbers</h2>
          <span className="faint">A picture for a post, made in this browser. Nothing is uploaded, and only what you switch on is in it.</span>
        </div>
        <button type="button" className="btn icon close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="share-body">
        <div className="share-preview">
          <img src={src} alt={`The card: ${post}`} />
        </div>
        <div className="share-options">
          <div className="share-designs seg" role="group" aria-label="Design">
            {DESIGNS.map((x) => (
              <button key={x.id} type="button" aria-pressed={design === x.id} onClick={() => setDesign(x.id)}>
                {x.name}
              </button>
            ))}
          </div>
          <label className="field">
            Title
            <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="share-toggles">
            {toggles
              .filter((x) => !x.off)
              .map((x) => (
                <label key={x.id} className="share-toggle">
                  <span>{x.label}</span>
                  <Switch on={show[x.id]} label={x.label} onChange={() => setShow((s) => ({ ...s, [x.id]: !s[x.id] }))} />
                </label>
              ))}
          </div>
          <div className="share-actions">
            <button
              type="button"
              className="btn primary big"
              disabled={!!busy}
              onClick={() =>
                act('download', async (png) => {
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(png)
                  a.download = file()
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                })
              }
            >
              {busy === 'download' ? <span className="btn-spin" aria-hidden="true" /> : done === 'download' ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Download size={16} strokeWidth={1.75} aria-hidden="true" />}
              {done === 'download' ? 'Saved' : 'Download'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!!busy || typeof ClipboardItem === 'undefined'}
              onClick={() => act('copy', (png) => navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]))}
            >
              {busy === 'copy' ? <span className="btn-spin" aria-hidden="true" /> : done === 'copy' ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.75} aria-hidden="true" />}
              {done === 'copy' ? 'Copied' : 'Copy image'}
            </button>
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
