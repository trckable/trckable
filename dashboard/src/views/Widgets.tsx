// Settings → Sharing → Widgets: a small card for the site's own pages. Pick a
// design, see it with the real numbers, copy one line. The card runs no
// script and sets no cookie; only the numbers its design shows are public.
import { Activity, BadgeCheck, CircleDot, Copy, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Site, type Widget, type WidgetKind, type WidgetLook } from '../lib/api'
import { CodeBlock } from '../components/Code'
import { Switch } from '../components/Switch'
import { confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { isViewer } from '../lib/me'
import './Widgets.css'

const KINDS: { id: WidgetKind; name: string; hint: string; Icon: typeof Activity; w: number; h: number }[] = [
  { id: 'live', name: 'Live now', hint: 'Visitors in the last 30 minutes, minute by minute, and where from', Icon: Activity, w: 320, h: 316 },
  { id: 'badge', name: 'This week', hint: 'Visitors in the last seven days', Icon: BadgeCheck, w: 240, h: 82 },
  { id: 'counter', name: 'Counter', hint: 'People on the site right now, in one line', Icon: CircleDot, w: 200, h: 48 },
]
const ACCENTS = ['', '#38bdf8', '#818cf8', '#f472b6', '#fb923c', '#facc15']
const RADII = [
  { id: 4, label: 'Square' },
  { id: 16, label: 'Rounded' },
  { id: 28, label: 'Round' },
]
const BRAND_H = 26

const size = (look: WidgetLook) => {
  const k = KINDS.find((x) => x.id === look.kind)!
  return { w: k.w, h: k.h + (look.brand ? BRAND_H : 0) }
}

export function snippet(base: string, w: Widget, domain: string) {
  const { w: width, h } = size(w)
  return `<iframe src="${base}/w/${w.id}" width="${width}" height="${h}" style="border:0;background:transparent" loading="lazy" title="Visitors on ${domain}"></iframe>`
}

export function WidgetsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Widget[] | null>(null)
  const [base, setBase] = useState(location.origin)
  const [look, setLook] = useState<WidgetLook>({ kind: 'live', theme: 'auto', accent: '', radius: 16, brand: true })
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
  const preview = (l: WidgetLook) =>
    `/api/v1/sites/${encodeURIComponent(site.id)}/widgets/preview?kind=${l.kind}&theme=${l.theme}&accent=${encodeURIComponent(l.accent)}&radius=${l.radius}&brand=${l.brand ? 1 : 0}`
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

      <div className="wg-kinds" role="radiogroup" aria-label="Design">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={look.kind === k.id} className="wg-kind" onClick={() => set({ kind: k.id })}>
            <span className={'icon-tile small' + (look.kind === k.id ? ' accent' : '')}>
              <k.Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="wg-kind-text">
              <b>{k.name}</b>
              <span className="faint">{k.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="wg-studio">
        <div className={'wg-stage ' + look.theme}>
          <iframe key={preview(look)} src={preview(look)} width={w} height={h} title="Widget preview" loading="lazy" />
        </div>
        <div className="wg-options">
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
          <div className="wg-opt">
            <span>“Counted by trckable”</span>
            <Switch on={look.brand} label="Show Counted by trckable" onChange={() => set({ brand: !look.brand })} />
          </div>
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
          <CodeBlock code={snippet(base, made, site.domain)} lang="html" wrap />
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
          {w.theme} · {w.radius}px · made {new Date(w.created_at * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
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
                body: 'Pages that show it get an empty space where it was. Nothing else changes.',
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
