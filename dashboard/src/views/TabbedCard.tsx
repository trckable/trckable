// A card with a head (its title, its tabs, a fold button) and the body of the tab picked.
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

/**
 * A card's hint. Wide screens read it beside the title; phones hide that line
 * (see .card-note) and show this (i) instead, which reveals the same words
 * when tapped. Nothing is lost, but the cards stay short.
 */
function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="info-dot" aria-label={text} title={text} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        i
      </button>
      {open && (
        <span className="faint note-open" style={{ fontSize: 12 }}>
          {text}
        </span>
      )}
    </>
  )
}

export function TabbedCard(p: { title: string; note?: string; extra?: React.ReactNode; tabs: { dim: string; label: string }[]; render: (dim: string) => React.ReactNode }) {
  const [tab, setTab] = useState(p.tabs[0].dim)
  // A card you never read can be folded away, and it stays folded.
  const key = 'trckable:fold:' + p.title
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const fold = (v: boolean) => {
    setFolded(v)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      /* private mode */
    }
  }
  const active = p.tabs.some((t) => t.dim === tab) ? tab : p.tabs[0].dim
  return (
    <div className={folded ? 'card folded' : 'card'} data-w={1}>
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="fold" aria-expanded={!folded} aria-label={folded ? `Show ${p.title}` : `Hide ${p.title}`} onClick={() => fold(!folded)}>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h2 style={{ whiteSpace: 'nowrap' }}>{p.title}</h2>
        {p.tabs.length > 1 ? (
          <div className="tabs" role="tablist" aria-label={`${p.title} breakdown`}>
            {p.tabs.map((t) => (
              <button key={t.dim} type="button" role="tab" aria-selected={active === t.dim} onClick={() => setTab(t.dim)}>
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          p.note && (
            <span className="faint card-note" style={{ fontSize: 12 }}>
              {p.note}
            </span>
          )
        )}
        {p.note && <InfoDot text={p.note} />}
        {p.extra}
      </div>
      {p.tabs.length > 1 && p.note && (
        <span className="faint card-note" style={{ fontSize: 12, marginTop: -6 }}>
          {p.note}
        </span>
      )}
      {!folded && <div role="tabpanel">{p.render(active)}</div>}
    </div>
  )
}
