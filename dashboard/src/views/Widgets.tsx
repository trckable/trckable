// Settings → Sharing → Widgets: a small card for the site's own pages. Pick a
// design, see it with the real numbers, copy one line. The card runs no
// script and sets no cookie; only the numbers its design shows are public.
import { Activity, BadgeCheck, Banknote, CircleDot, Copy, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Site, type Widget, type WidgetKind, type WidgetLook } from '../lib/api'
import { CodeBlock } from '../components/Code'
import { Switch } from '../components/Switch'
import { confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { isViewer } from '../lib/me'
import './Widgets.css'

const KINDS: { id: WidgetKind; name: string; hint: string; Icon: typeof Activity; w: number; fresh?: boolean }[] = [
  { id: 'live', name: 'Live now', hint: 'Visitors in the last 30 minutes, minute by minute', Icon: Activity, w: 320 },
  { id: 'badge', name: 'Last 7 days', hint: 'Visitors in the last seven days', Icon: BadgeCheck, w: 260 },
  { id: 'counter', name: 'Counter', hint: 'Visitors in the last 30 minutes, in one line', Icon: CircleDot, w: 200 },
  { id: 'revenue', name: 'Open revenue', hint: "This month's revenue and the channels that brought it", Icon: Banknote, w: 320, fresh: true },
  { id: 'privacy', name: 'Privacy seal', hint: 'What this site records, read live from its settings', Icon: ShieldCheck, w: 320, fresh: true },
]

// The parts a design can show, with the ones it starts with.
const PARTS: Record<WidgetKind, { id: string; name: string; hint?: string }[]> = {
  live: [
    { id: 'bars', name: 'Minute by minute', hint: 'Thirty bars, with the time and count on hover' },
    { id: 'countries', name: 'Where from', hint: 'The top three countries' },
    { id: 'channels', name: 'Came from', hint: 'Search, AI assistants, social…' },
    { id: 'pages', name: 'Reading now', hint: 'The top three pages. Their paths become public' },
  ],
  badge: [{ id: 'ai', name: 'Share from AI assistants', hint: 'Visitors who came from ChatGPT, Claude, Perplexity…' }],
  counter: [],
  revenue: [{ id: 'channels', name: 'Where it came from', hint: 'The channels that brought the money' }],
  privacy: [],
}
const DEFAULT_PARTS: Record<WidgetKind, string[]> = { live: ['bars', 'countries'], badge: [], counter: [], revenue: ['channels'], privacy: [] }

const ACCENTS = ['', '#38bdf8', '#818cf8', '#f472b6', '#fb923c', '#facc15']
const RADII = [
  { id: 4, label: 'Square' },
  { id: 16, label: 'Rounded' },
  { id: 28, label: 'Round' },
]
type Place = 'inline' | 'br' | 'bl'
const PLACES: { id: Place; label: string }[] = [
  { id: 'inline', label: 'Where I paste it' },
  { id: 'br', label: 'Floating, bottom right' },
  { id: 'bl', label: 'Floating, bottom left' },
]

// The page's height for a look, so the frame never scrolls or leaves a gap.
const LIST = 104 // a heading and three rows
const size = (look: WidgetLook) => {
  const k = KINDS.find((x) => x.id === look.kind)!
  const has = (p: string) => look.shows.includes(p)
  let h = 0
  if (look.kind === 'live') h = 106 + (has('bars') ? 100 : 0) + LIST * ['countries', 'channels', 'pages'].filter(has).length
  else if (look.kind === 'revenue') h = 106 + (has('channels') ? LIST : 0)
  else if (look.kind === 'privacy') h = 250
  else if (look.kind === 'badge') h = 72
  else h = 44
  return { w: k.w, h: h + (look.brand ? 28 : 0) }
}

export function snippet(base: string, w: Widget, domain: string, place: Place = 'inline') {
  const { w: width, h } = size(w)
  const frame = `<iframe src="${base}/w/${w.id}" width="${width}" height="${h}" style="border:0;background:transparent" loading="lazy" title="${KINDS.find((k) => k.id === w.kind)!.name} on ${domain}"></iframe>`
  if (place === 'inline') return frame
  // Floating: a fixed corner, still no script.
  const side = place === 'br' ? 'right' : 'left'
  return `<div style="position:fixed;${side}:16px;bottom:16px;z-index:50;max-width:calc(100vw - 32px)">\n  ${frame}\n</div>`
}

export function WidgetsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Widget[] | null>(null)
  const [base, setBase] = useState(location.origin)
  const [look, setLook] = useState<WidgetLook>({ kind: 'live', theme: 'auto', accent: '', radius: 16, brand: true, shows: DEFAULT_PARTS.live })
  const [place, setPlace] = useState<Place>('inline')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<Widget | null>(null)
  const load = () =>
    api
      .widgets(site.id)
      .then((r) => (setList(r.widgets), r.base && setBase(r.base.replace(/\/$/, ''))))
      .catch(() => setList([]))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  const set = (patch: Partial<WidgetLook>) => (setMade(null), setLook((l) => ({ ...l, ...patch })))
  const pick = (kind: WidgetKind) => set({ kind, shows: DEFAULT_PARTS[kind] })
  const togglePart = (p: string) => set({ shows: look.shows.includes(p) ? look.shows.filter((x) => x !== p) : [...look.shows, p] })
  const preview = (l: WidgetLook) =>
    `/api/v1/sites/${encodeURIComponent(site.id)}/widgets/preview?kind=${l.kind}&theme=${l.theme}&accent=${encodeURIComponent(l.accent)}&radius=${l.radius}&shows=${l.shows.join(',')}`
  const create = () => {
    setBusy(true)
    api
      .createWidget(site.id, look)
      .then((w) => (setMade(w), load(), toast('Widget ready — copy it onto your page')))
      .catch((e: Error) => toast(e.message, 'error'))
      .finally(() => setBusy(false))
  }
  const { w, h } = size(look)

  return (
    <section className="wg" id="widgets">
      <div className="wg-head">
        <h2>Widgets for your site</h2>
        <span className="faint">A small card with live numbers, for your own pages. It runs no script and sets no cookie, and only the numbers it shows are public.</span>
      </div>

      <div className="wg-tabs" role="radiogroup" aria-label="Design">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={look.kind === k.id} className="wg-tab" onClick={() => pick(k.id)} title={k.hint}>
            <k.Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            {k.name}
            {k.fresh && <span className="wg-dot" title="Only in trckable" aria-label="new, only in trckable" />}
          </button>
        ))}
      </div>
      <p className="wg-hint">
        {KINDS.find((k) => k.id === look.kind)!.hint}
        {KINDS.find((k) => k.id === look.kind)!.fresh && <span className="wg-only"> · only in trckable</span>}
      </p>

      <div className="wg-studio">
        <div className={'wg-stage ' + look.theme}>
          <iframe key={preview(look)} src={preview(look)} width={w} height={h} title="Widget preview" loading="lazy" />
        </div>
        <div className="wg-options">
          {PARTS[look.kind].length > 0 && (
            <div className="wg-opt">
              <span>Show</span>
              <div className="wg-parts">
                {PARTS[look.kind].map((p) => (
                  <label key={p.id} className="wg-part" title={p.hint}>
                    <span>
                      <b>{p.name}</b>
                      {p.hint && <span className="faint">{p.hint}</span>}
                    </span>
                    <Switch on={look.shows.includes(p.id)} label={p.name} onChange={() => togglePart(p.id)} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="wg-opt">
            <span>Theme</span>
            <span className="seg" role="group" aria-label="Theme">
              {(['auto', 'dark', 'light'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={look.theme === t} onClick={() => set({ theme: t })}>
                  {t === 'auto' ? 'Auto' : t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </span>
          </label>
          <div className="wg-opt">
            <span>Colour</span>
            <span className="wg-swatches" role="radiogroup" aria-label="Colour">
              {ACCENTS.map((c) => (
                <button
                  key={c || 'own'}
                  type="button"
                  role="radio"
                  aria-checked={look.accent === c}
                  aria-label={c || "trckable's own"}
                  className={'wg-swatch' + (c ? '' : ' own')}
                  style={c ? { background: c } : undefined}
                  onClick={() => set({ accent: c })}
                />
              ))}
            </span>
          </div>
          <label className="wg-opt">
            <span>Corners</span>
            <span className="seg" role="group" aria-label="Corners">
              {RADII.map((r) => (
                <button key={r.id} type="button" aria-pressed={look.radius === r.id} onClick={() => set({ radius: r.id })}>
                  {r.label}
                </button>
              ))}
            </span>
          </label>
          <label className="wg-opt">
            <span>Placement</span>
            <span className="seg wg-place" role="group" aria-label="Placement">
              {PLACES.map((p) => (
                <button key={p.id} type="button" aria-pressed={place === p.id} onClick={() => setPlace(p.id)}>
                  {p.id === 'inline' ? 'Inline' : p.id === 'br' ? 'Corner ↘' : 'Corner ↙'}
                </button>
              ))}
            </span>
            <span className="faint wg-place-hint">{PLACES.find((p) => p.id === place)!.label}</span>
          </label>
          {!isViewer() && (
            <button type="button" className="btn primary big wg-make" disabled={busy} onClick={create}>
              {busy && <span className="btn-spin" aria-hidden="true" />}
              {busy ? 'Making it…' : 'Make this widget'}
            </button>
          )}
        </div>
      </div>

      {made && (
        <div className="wg-made">
          <b>Paste this where the card should appear</b>
          <CodeBlock code={snippet(base, made, site.domain, place)} lang="html" wrap />
        </div>
      )}

      {list && list.length > 0 && (
        <div className="wg-list">
          <span className="wg-list-head">Your widgets</span>
          {list.map((x) => (
            <WidgetRow key={x.id} site={site} w={x} base={base} onChange={load} />
          ))}
        </div>
      )}
    </section>
  )
}

function WidgetRow({ site, w, base, onChange }: { site: Site; w: Widget; base: string; onChange: () => void }) {
  const k = KINDS.find((x) => x.id === w.kind)!
  const [on, setOn] = useState(w.on)
  const toggle = () => {
    setOn(!on)
    api
      .updateWidget(site.id, w.id, { ...w, on: !on })
      .then(() => (toast(on ? 'Widget off — its page answers not found' : 'Widget on'), onChange()))
      .catch((e: Error) => (setOn(on), toast(e.message, 'error')))
  }
  return (
    <div className="wg-row">
      <span className="icon-tile small" aria-hidden="true">
        <k.Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="wg-row-text">
        <b>{k.name}</b>
        <span className="faint num">
          {[w.theme, ...w.shows].join(' · ')} · made {new Date(w.created_at * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </span>
      </span>
      <button
        type="button"
        className="btn icon ghost"
        aria-label="Copy the snippet"
        title="Copy the snippet"
        onClick={() => navigator.clipboard?.writeText(snippet(base, w, site.domain)).then(() => toast('Snippet copied'))}
      >
        <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {!isViewer() && (
        <>
          <Switch on={on} label={`${k.name} widget on`} onChange={toggle} />
          <button
            type="button"
            className="btn icon ghost"
            aria-label="Delete this widget"
            title="Delete"
            onClick={async () => {
              const ok = await confirm({
                title: 'Delete this widget?',
                body: 'Within a minute, pages that show it get an empty space where it was. Nothing else changes.',
                confirmLabel: 'Delete',
                danger: true,
                busyLabel: 'Deleting…',
                done: 'Widget deleted',
                run: () => api.deleteWidget(site.id, w.id),
              })
              if (ok) onChange()
            }}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}
