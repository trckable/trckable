// Share your numbers: the picture on the left, the panel on the right (what to share, the period, the numbers,
// the look, then download or copy). The picture is drawn on the server from the site's totals, top pages, chart
// and top country (never a visitor), and revenue is in it only where the report would show it. A read-only link is
// the Link corner.
import { Link2, X } from 'lucide-react'
import { more, type Share } from '../../lib/apiMore'
import { useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { Modal } from '../../kit/Modal'
import { toast } from '../../components/Toast'
import { fmtRange, todayIn } from '../../lib/dates'
import { ACCENTS, DEFAULT_STATS, METRICS, cardUrl, comparing, fileName, formatOf, hasNumbers, hasOf, missing, PICTURES, picturesOf, statsWith, type CardWords, type Look, type Mode, type Period, type Topic } from './card'
import { Actions, type Act } from './Actions'
import { LinkPicker } from './LinkPicker'
import { copyForSlack, linkedInAddress, postLink, xAddress } from './post'
import { nameOf } from '../sharelinks/copy'
import { copy } from './copy'
import { copyImage, saveImage, shareImage } from './image'
import { LinkPanel } from './LinkPanel'
import { Preview } from './Preview'
import { CardSection } from './CardSection'
import { LookSection } from './LookSection'
import { NumbersSection } from './NumbersSection'
import { PeriodSection } from './PeriodSection'
import { ModeSwitch } from './ModeSwitch'
import { Section } from './Section'
import { useLook } from './useLook'
import './ShareDialog.css'
import { fail } from '../../components/toastBus'

type Props = { site: Site; sites: Site[]; period?: Period; /** The gallery's group the dialog opens on: its first picture is the one shown. */ topic?: Topic; onClose: () => void }

export default function ShareDialog({ site: first, sites, period = '7d', topic = 'overview', onClose }: Props) {
  const [siteId, setSiteId] = useState(first.id)
  const site = sites.find((s) => s.id === siteId) ?? first
  const [look, setLook] = useState<Look>({ template: picturesOf(topic)[0].id, shape: 'link', period, compare: false, metric: 'visitors', stats: DEFAULT_STATS, theme: 'dark', accent: ACCENTS[0] })
  // A new big number is not shown again among the small ones.
  const set = (l: Partial<Look>) => setLook((x) => (l.metric ? { ...x, ...l, stats: statsWith(l.stats ?? x.stats, l.metric) } : { ...x, ...l }))
  const brand = useLook(site.id)
  // The picture asks with the site's choice, so it is drawn again when that flips.
  const shown: Look = { ...look, hideBrand: brand.look && !brand.look.brand_locked ? brand.look.hide_brand : undefined }
  const [words, setWords] = useState<CardWords | null>(null)
  const [busy, setBusy] = useState<Act | null>(null)
  const [done, setDone] = useState<Act | null>(null)
  const [linking, setLinking] = useState(false)
  // The site's links: what Copy link copies, and the link a post carries. Read when the dialog opens and when the link panel closes.
  const [links, setLinks] = useState<Share[]>([])
  const [picking, setPicking] = useState(false)
  const [mode, setMode] = useState<Mode>('picture')
  const [open, setOpen] = useState('card')
  const toggle = (id: string) => setOpen((o) => (o === id ? '' : id))

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
        // A picture the period cannot fill (no visit in it) gives way to the overview.
        const now = PICTURES.find((p) => p.id === look.template)
        if (now && missing(now, hasOf(w))) set({ template: 'overview' })
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [site.id, look.period, look.range?.from, look.range?.to, look.compare, look.metric, look.template]) // eslint-disable-line react-hooks/exhaustive-deps -- the words depend on these only
  useEffect(() => {
    if (!can('share.manage') || linking) return
    more
      .shares(site.id)
      .then((r) => setLinks(r.shares.filter((x) => x.url)))
      .catch(() => setLinks([]))
  }, [site.id, linking])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 1600)
    return () => clearTimeout(t)
  }, [done])

  const copyLink = async (link: Share) => {
    if (!link.url) return
    setPicking(false)
    await navigator.clipboard.writeText(link.url)
    toast(copy.linkCopiedNamed(nameOf(link)))
    setDone('link')
  }
  const go = async (act: Act) => {
    setBusy(act)
    try {
      const url = cardUrl(site.id, shown)
      if (act === 'text') {
        await navigator.clipboard.writeText(words?.post ?? '')
        toast(copy.copied)
      } else if (act === 'link') {
        // A link that exists; one is never made by a click on Copy. Several: the person says which.
        if (!links.length) {
          toast(copy.noLink)
          setLinking(true)
          return
        }
        if (links.length > 1) {
          setPicking(true)
          return
        }
        await copyLink(links[0])
      } else if (act === 'x' || act === 'linkedin') {
        // Opened at once, in the click: a window asked for after a wait is one a browser may refuse.
        window.open(act === 'x' ? xAddress(words?.post ?? '', postLink(links)) : linkedInAddress(words?.post ?? '', postLink(links)), '_blank', 'noopener,noreferrer')
      } else if (act === 'slack') {
        await copyForSlack(words?.post ?? '', postLink(links))
        toast(copy.slackCopied)
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
  const has = hasOf(words)
  const px = formatOf(look.shape)
  const today = todayIn(site.timezone)
  const metrics = METRICS.filter((m) => m !== 'revenue' || words?.revenue)

  const periodSummary = [look.period === 'custom' && look.range ? fmtRange(look.range, today) : copy.periods[look.period], comparing(look) ? copy.compare : ''].filter(Boolean).join(' · ')
  const numbersSummary = copy.metrics[look.metric]

  return (
    <Modal label={copy.title} className="sd-modal" onClose={onClose}>
      <span className="sd-handle" aria-hidden="true" />
      <div className="sd-head">
        <h2>{copy.title}</h2>
        {can('share.manage') && (
          <button type="button" className="btn sd-links" aria-pressed={linking} title={copy.linkTitle} onClick={() => setLinking((x) => !x)}>
            <Link2 size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{copy.link}</span>
          </button>
        )}
        <button type="button" className="btn icon sd-close" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {linking && <LinkPanel site={site} onBack={() => setLinking(false)} />}
      {!linking && (
        <div className="sd-body">
          <div className="sd-stage">
            <Preview site={site.id} look={shown} words={words} mode={mode} />
          </div>
          <div className="sd-panel">
            <div className="sd-sections">
              <ModeSwitch mode={mode} onChange={setMode} />
              <Section id="card" title={copy.whatToShare} summary={copy.template[look.template].name} open={open === 'card'} onToggle={() => toggle('card')}>
                <CardSection site={site.id} look={shown} has={has} onChange={(t) => set({ template: t })} />
              </Section>
              <Section id="period" title={copy.period} summary={periodSummary} open={open === 'period'} onToggle={() => toggle('period')}>
                <PeriodSection look={look} tz={site.timezone} set={set} />
              </Section>
              {hasNumbers(look.template) && (
                <Section id="numbers" title={copy.numbers} summary={numbersSummary} open={open === 'numbers'} onToggle={() => toggle('numbers')}>
                  <NumbersSection look={look} metrics={metrics} revenue={words?.revenue ?? false} set={set} />
                </Section>
              )}
              {mode === 'picture' && <Section id="look" title={copy.lookTitle} summary={copy[look.theme]} open={open === 'look'} onToggle={() => toggle('look')}>
                <LookSection site={site} sites={sites.length ? sites : [site]} onSite={setSiteId} look={look} set={set} brand={brand} />
              </Section>}
            </div>
            {picking && <LinkPicker shares={links} onPick={(l) => void copyLink(l).catch(fail)} onClose={() => setPicking(false)} />}
            <Actions post={mode === 'text'} link={can('share.manage')} size={`${px.w}×${px.h}`} busy={busy} done={done} onAct={(a) => void go(a)} />
          </div>
        </div>
      )}
    </Modal>
  )
}
