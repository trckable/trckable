// Settings → Widgets: a small card for the site's own pages. The site's
// widgets first, as compact rows, then one button that opens the dialog to make
// another: pick a design, see it with the real numbers, copy one line. The card
// runs no script and sets no cookie; only the numbers its design shows are public.
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Site, type Widget, more } from '../lib/apiMore'
import { isViewer } from '../lib/me'
import { TEXT } from './widgetKinds'
import { WidgetCreator } from './WidgetCreator'
import { WidgetEditor } from './WidgetEditor'
import { WidgetRow } from './WidgetRow'
import './Widgets.css'

export function WidgetsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Widget[] | null>(null)
  const [base, setBase] = useState(location.origin)
  const [making, setMaking] = useState(false)
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

  return (
    <section className="wg" id="widgets">
      <div className="wg-head">
        <h2 title={TEXT.pageHint}>{TEXT.pageTitle}</h2>
        {!isViewer() && (
          <button type="button" className="btn primary" onClick={() => setMaking(true)}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            {TEXT.newWidget}
          </button>
        )}
      </div>

      {list && list.length > 0 && (
        <div className="wg-list">
          {list.map((x) => (
            <WidgetRow key={x.id + x.name} site={site} w={x} base={base} onChange={load} onEdit={setEditing} />
          ))}
        </div>
      )}
      {list?.length === 0 && <span className="faint">{TEXT.none}</span>}
      {making && <WidgetCreator site={site} base={base} onClose={() => setMaking(false)} onMade={() => void load()} />}
      {editing && <WidgetEditor site={site} w={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </section>
  )
}
