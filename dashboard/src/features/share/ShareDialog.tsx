// Share your numbers: pick a card on the left, see it in the middle, tune it
// in the row above, download it. The card is drawn on the server from the
// site's totals, top pages and chart (never a visitor), and revenue is in it
// only where the report would show it. A read-only link is the "Link" corner.
import { Link2, Share2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { Modal } from '../../kit/Modal'
import { toast } from '../../components/Toast'
import { ACCENTS, cardUrl, fileName, type CardWords, type Look, type Metric } from './card'
import { copy } from './copy'
import { LinkPanel } from './LinkPanel'
import { Preview } from './Preview'
import { Templates } from './Templates'
import { GoButton, Toolbar } from './Toolbar'
import { Periods } from './Periods'
import './ShareDialog.css'
import { fail } from '../../components/toastBus'

const METRICS: Metric[] = ['visitors', 'revenue']

export default function ShareDialog({ site: first, sites, onClose }: { site: Site; sites: Site[]; onClose: () => void }) {
  const [siteId, setSiteId] = useState(first.id)
  const site = sites.find((s) => s.id === siteId) ?? first
  const [look, setLook] = useState<Look>({ template: 'spotlight', period: '7d', metric: 'visitors', theme: 'dark', accent: ACCENTS[0] })
  const set = (l: Partial<Look>) => setLook((x) => ({ ...x, ...l }))
  const [words, setWords] = useState<CardWords | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [linking, setLinking] = useState(false)

  // The words: whether revenue may be picked, and the post's text. Revenue
  // is never the default; asked for where it is not allowed, the server
  // answers with visitors, and the switch follows.
  useEffect(() => {
    let stale = false
    fetch(cardUrl(site.id, look, 'json'), { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<CardWords>) : null))
      .then((w) => {
        if (stale || !w) return
        setWords(w)
        if (w.metric !== look.metric) set({ metric: w.metric })
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [site.id, look.period, look.metric]) // eslint-disable-line react-hooks/exhaustive-deps -- the words depend on these three only
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1600)
    return () => clearTimeout(t)
  }, [done])

  const go = async () => {
    setBusy(true)
    try {
      if (look.template === 'post') {
        await navigator.clipboard.writeText(words?.post ?? '')
        toast(copy.copied)
      } else {
        const r = await fetch(cardUrl(site.id, look), { credentials: 'same-origin' })
        if (!r.ok) throw new Error(copy.failed)
        const a = document.createElement('a')
        a.href = URL.createObjectURL(await r.blob())
        a.download = fileName(site.domain, look)
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }
      setDone(true)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }
  const metrics = words?.revenue ? METRICS : []

  return (
    <Modal label={copy.title} className="sd-modal" onClose={onClose}>
      <span className="sd-handle" aria-hidden="true" />
      <div className="sd-head">
        <span className="modal-badge" aria-hidden="true">
          <Share2 size={18} strokeWidth={1.75} />
        </span>
        <div className="sd-title">
          <h2>{copy.title}</h2>
          <span className="faint">{copy.subtitle}</span>
        </div>
        {!linking && <Periods value={look.period} onChange={(p) => set({ period: p })} className="sd-period is-head" />}
        {!isViewer() && (
          <button type="button" className="btn sd-linkbtn" aria-pressed={linking} title={copy.linkTitle} onClick={() => setLinking((x) => !x)}>
            <Link2 size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="label">{copy.link}</span>
          </button>
        )}
        <button type="button" className="btn icon sd-close" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {linking && <LinkPanel site={site} onBack={() => setLinking(false)} />}
      {!linking && (
        <div className="sd-body">
          <Templates value={look.template} onChange={(t) => set({ template: t })} />
          <Periods value={look.period} onChange={(p) => set({ period: p })} className="sd-period is-body" />
          <Toolbar site={site} sites={sites.length ? sites : [site]} onSite={setSiteId} look={look} set={set} metrics={metrics} />
          <GoButton post={look.template === 'post'} busy={busy} done={done} onGo={() => void go()} />
          <Preview site={site.id} look={look} words={words} />
        </div>
      )}
    </Modal>
  )
}
