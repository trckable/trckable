// Share your numbers: pick a card on the left, see it in the middle, tune it
// in the row above, then share, copy or save it. The card is drawn on the
// server from the site's totals, top pages, chart and top country (never a
// visitor), and revenue is in it only where the report would show it. A
// read-only link is the "Link" corner.
import { Link2, Share2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { Modal } from '../../kit/Modal'
import { toast } from '../../components/Toast'
import { ACCENTS, cardUrl, fileName, type CardWords, type Look, type Metric, type Period } from './card'
import { Actions, type Act } from './Actions'
import { copy } from './copy'
import { copyImage, saveImage, shareImage } from './image'
import { LinkPanel } from './LinkPanel'
import { Preview } from './Preview'
import { Templates } from './Templates'
import { Toolbar } from './Toolbar'
import { Periods } from './Periods'
import './ShareDialog.css'
import { fail } from '../../components/toastBus'

const METRICS: Metric[] = ['visitors', 'revenue']

export default function ShareDialog({ site: first, sites, period = '7d', onClose }: { site: Site; sites: Site[]; period?: Period; onClose: () => void }) {
  const [siteId, setSiteId] = useState(first.id)
  const site = sites.find((s) => s.id === siteId) ?? first
  const [look, setLook] = useState<Look>({ template: 'overview', period, metric: 'visitors', theme: 'dark', accent: ACCENTS[0] })
  const set = (l: Partial<Look>) => setLook((x) => ({ ...x, ...l }))
  const [words, setWords] = useState<CardWords | null>(null)
  const [busy, setBusy] = useState<Act | null>(null)
  const [done, setDone] = useState<Act | null>(null)
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
    const t = setTimeout(() => setDone(null), 1600)
    return () => clearTimeout(t)
  }, [done])

  const go = async (act: Act) => {
    setBusy(act)
    try {
      const url = cardUrl(site.id, look)
      if (act === 'text') {
        await navigator.clipboard.writeText(words?.post ?? '')
        toast(copy.copied)
      } else if (act === 'copy') {
        await copyImage(url)
        toast(copy.imageCopied)
      } else if (act === 'share') await shareImage(url, fileName(site.domain, look), site.domain)
      else await saveImage(url, fileName(site.domain, look))
      setDone(act)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
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
        {can('share.manage') && (
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
          <Preview site={site.id} look={look} words={words} />
          <Actions post={look.template === 'post'} busy={busy} done={done} onAct={(a) => void go(a)} />
        </div>
      )}
    </Modal>
  )
}
