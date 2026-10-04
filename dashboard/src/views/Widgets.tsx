// Settings → Sharing → Widgets: a small card for the site's own pages. Pick a
// design, see it with the real numbers, copy one line. The card runs no
// script and sets no cookie; only the numbers its design shows are public.
import { useEffect, useState } from 'react'
import { CodeBlock } from '../components/Code'
import { toast } from '../components/Toast'
import { isViewer } from '../lib/me'
import { fail, type Site, type Widget, type WidgetLook, more } from '../lib/apiMore'
import { EMPTY_LOOK, TEXT, cornerCode, frameCode, snippet, type Place } from './widgetKinds'
import { WidgetEditor } from './WidgetEditor'
import { WidgetRow } from './WidgetRow'
import { WidgetStudio } from './WidgetStudio'
import './Widgets.css'

export function WidgetsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Widget[] | null>(null)
  const [base, setBase] = useState(location.origin)
  const [look, setLook] = useState<WidgetLook>(EMPTY_LOOK)
  const [place, setPlace] = useState<Place>('inline')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<Widget | null>(null)
  const [editing, setEditing] = useState<Widget | null>(null)
  const load = () =>
    more
      .widgets(site.id)
      .then((r) => {
        setList(r.widgets)
        if (r.base) setBase(r.base.replace(/\/$/, ''))
      })
      .catch(() => setList([]))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function every render; refetch only when the site changes
  }, [site.id])

  const create = () => {
    setBusy(true)
    more
      .createWidget(site.id, { ...look, name: look.name?.trim() })
      .then((w) => {
        setMade(w)
        void load()
        toast('Widget ready — copy it onto your page')
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  const make = !isViewer() && (
    <div className="wg-actions">
      <button type="button" className="btn primary big wg-make" disabled={busy} onClick={create}>
        {busy && <span className="btn-spin" aria-hidden="true" />}
        {TEXT.make[busy ? 1 : 0]}
      </button>
    </div>
  )

  return (
    <section className="wg" id="widgets">
      <div className="wg-head">
        <h2>Widgets for your site</h2>
        <span className="faint">A small card with live numbers, for your own pages. It runs no script and sets no cookie, and only the numbers it shows are public.</span>
      </div>

      <WidgetStudio
        site={site}
        look={look}
        onLook={(patch) => {
          setMade(null)
          setLook((l) => ({ ...l, ...patch }))
        }}
        place={place}
        onPlace={setPlace}
        footer={make}
      />

      {made && (
        <div className="wg-made">
          <b>{TEXT.frame}</b>
          <CodeBlock code={made.kind === 'online' ? frameCode(base, made, site.domain) : snippet(base, made, site.domain, place)} lang="html" wrap />
          {made.kind === 'online' && (
            <>
              <b>{TEXT.corner}</b>
              <CodeBlock code={cornerCode(base, made)} lang="html" wrap />
            </>
          )}
        </div>
      )}

      {list && list.length > 0 && (
        <div className="wg-list">
          <span className="wg-list-head">Your widgets</span>
          {list.map((x) => (
            <WidgetRow key={x.id + x.name} site={site} w={x} base={base} onChange={load} onEdit={setEditing} />
          ))}
        </div>
      )}
      {editing && <WidgetEditor site={site} w={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </section>
  )
}
