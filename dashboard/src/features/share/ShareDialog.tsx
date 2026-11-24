// The share studio: one screen that never scrolls or folds. Pick where the card goes (left), see it at that place's size
// (middle) with the cards to pick from under it, style it (right), then post it, download it or copy a link.
// The card is drawn on the server from the site's own numbers: the picture here, the file and the picture a shared
// link carries are one card. Nothing is posted by the server; a network opens with the post written.
import { Link2, Palette, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Milestone, type Site } from '../../lib/api'
import { more, type Share } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { QUERY } from '../../kit/breakpoints'
import { Modal } from '../../kit/Modal'
import { useMedia } from '../../lib/useNarrow'
import { toast } from '../../components/Toast'
import { fail } from '../../components/toastBus'
import { todayIn } from '../../lib/dates'
import { isMoney, say } from '../milestones/words'
import { cardOf, cardOfTopic, cardUrl, fileName, formatOf, hasOf, offered, type CardWords, type Group, type Look, type Period, type Style, type Topic } from './card'
import { CardStrip, type Tab, type Tile } from './CardStrip'
import { LinkPanel } from './LinkPanel'
import { cardLink, linkFor } from './link'
import { canShareImage, saveImage, shareImage } from './image'
import { copy } from './copy'
import { OPENERS, postText, takesText } from './post'
import { writePost } from './postWriter'
import { PostText } from './PostText'
import { Preview } from './Preview'
import { placeOf, sizeAt, type Place } from './places'
import { openRange } from './range'
import { ShareTo } from './ShareTo'
import { SizeBar } from './SizeBar'
import { StudioActions, type Act } from './StudioActions'
import { StylePanel } from './StylePanel'
import { keepStyle, savedStyle } from './style'
import { useLook } from './useLook'
import './ShareDialog.css'

type Props = { site: Site; sites: Site[]; period?: Period; /** The topic the dialog opens on: its card is the one shown. */ topic?: Topic; onClose: () => void }

/** The milestones a card may carry: the ones that are not money (a link shows no revenue, and no AI visits), the newest first. */
const reached = (list: Milestone[]) => list.filter((m) => !isMoney(m.kind) && m.kind !== 'ai_visits').sort((a, b) => b.day.localeCompare(a.day) || b.created_at - a.created_at)

export default function ShareDialog({ site, period = '30d', topic, onClose }: Props) {
  const [place, setPlace] = useState<Place>('linkedin')
  const [size, setSize] = useState(0)
  const [look, setLook] = useState<Look>(() => ({ card: cardOfTopic(topic), shape: sizeAt('linkedin', 0).shape, period, ...savedStyle(site.id) }))
  const [group, setGroup] = useState<Group>(() => cardOf(cardOfTopic(topic)).group)
  const [words, setWords] = useState<CardWords | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  const [reachedAll, setReached] = useState<Milestone[] | null>(null)
  const [links, setLinks] = useState<Share[]>([])
  const [linking, setLinking] = useState(false)
  const [styling, setStyling] = useState(false)
  const [busy, setBusy] = useState<Act | null>(null)
  const [done, setDone] = useState<Act | null>(null)
  const phone = useMedia(QUERY.handheld)
  const owner = can('share.manage')
  const brand = useLook(site.id)

  const shape = sizeAt(place, size).shape
  // The picture asks with the site's choice, so it is drawn again when that flips.
  const shown: Look = { ...look, shape, hideBrand: brand.look && !brand.look.brand_locked ? brand.look.hide_brand : undefined }
  const set = (l: Partial<Look>) => setLook((x) => ({ ...x, ...l }))
  const style = (s: Partial<Style>) => {
    set(s)
    keepStyle(site.id, { style: look.style, accent: look.accent, name: look.name, date: look.date, chart: look.chart, ...s })
  }

  // The card's words and what the site can make, for this card and period.
  const wordsAt = cardUrl(site.id, shown, 'json')
  useEffect(() => {
    let stale = false
    fetch(wordsAt, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<CardWords>) : null))
      .then((w) => !stale && w && setWords(w))
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [wordsAt])
  useEffect(() => {
    api
      .milestones(site.id)
      .then((r) => setReached(r.enabled ? reached(r.milestones) : []))
      .catch(() => setReached([]))
  }, [site.id])
  useEffect(() => {
    if (!owner) return
    more
      .shares(site.id)
      .then((r) => setLinks(r.shares.filter((x) => x.url)))
      .catch(() => setLinks([]))
  }, [site.id, owner])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 1600)
    return () => clearTimeout(t)
  }, [done])

  const reachedList = useMemo(() => reachedAll ?? [], [reachedAll])
  const has = hasOf(words)
  const first = words?.first_day
  const today = todayIn(site.timezone)
  const tabs: Tab[] = useMemo(
    () =>
      offered(has, reachedList.length).map(({ group: g, cards }) => ({
        group: g,
        name: copy.groups[g],
        tiles: cards.flatMap((id): Tile[] =>
          id === 'milestone'
            ? reachedList.map((m) => ({ key: `${m.kind}~${m.step}`, card: id, ms: `${m.kind}~${m.step}`, name: [say(m).big, say(m).label].filter(Boolean).join(' ') }))
            : [{ key: id, card: id, name: copy.cards[id] }],
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `has` is read from the words
    [reachedList, words],
  )
  // A card the site cannot make in this period (or no longer has) gives way to the first it can.
  useEffect(() => {
    if (!words || !reachedAll) return
    const now = tabs.flatMap((t) => t.tiles).some((t) => t.card === look.card && t.ms === look.ms)
    const first = tabs[0]?.tiles[0]
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a card the site cannot make gives way once the words say so
    if (!now && first) set({ card: first.card, ms: first.ms })
    if (!tabs.some((t) => t.group === group) && tabs[0]) setGroup(tabs[0].group)
  }, [tabs]) // eslint-disable-line react-hooks/exhaustive-deps -- only when what can be made changes

  const pickPlace = (p: Place) => {
    setPlace(p)
    setSize(0)
  }
  // A custom range opens on the days it had, or on the last 30.
  const pickPeriod = (p: Period) => set(p === 'custom' && !(look.from && look.to) ? { period: p, ...openRange(today, first) } : { period: p })
  const pickGroup = (g: Group) => {
    setGroup(g)
    const t = tabs.find((x) => x.group === g)?.tiles[0]
    if (t && cardOf(look.card).group !== g) set({ card: t.card, ms: t.ms })
  }
  // Trckable is named unless the card hides its brand.
  const written = writePost(words?.facts, words?.post ?? '', place, shown.hideBrand !== true)
  const text = postText(written, edited)
  const px = formatOf(shape)

  const ensureLink = async () => {
    const url = await cardLink(site.id, links, shown, first)
    if (!linkFor(links, shown, first)) setLinks((await more.shares(site.id)).shares.filter((x) => x.url))
    return url
  }
  const save = () => saveImage(cardUrl(site.id, shown), fileName(site.domain, shown))
  const open = async () => {
    // The window is opened in the click: one asked for after a wait is one a browser may refuse. Its address follows.
    const win = window.open('', '_blank')
    try {
      if (!takesText(place)) await navigator.clipboard.writeText(text)
      const url = OPENERS[place]?.(text, await ensureLink())
      if (!url) throw new Error(copy.failed)
      if (win) {
        win.opener = null
        win.location.href = url
      } else window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      win?.close()
      throw e
    }
  }
  const go = async (act: Act) => {
    setBusy(act)
    try {
      if (act === 'save' || (act === 'main' && place === 'download')) await save()
      else if (act === 'link' || (act === 'main' && place === 'email')) await navigator.clipboard.writeText(await ensureLink())
      else if (place === 'instagram') {
        if (phone && canShareImage()) await shareImage(cardUrl(site.id, shown), fileName(site.domain, shown), site.domain)
        else await save()
      } else await open()
      setDone(act)
    } catch (e) {
      if (!owner) toast(copy.needsOwner, 'error')
      else fail(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal label={copy.title} className="sd-modal" onClose={onClose}>
      <span className="sd-handle" aria-hidden="true" />
      <div className="sd-head">
        <h2>{copy.title}</h2>
        <span className="sd-site">{site.domain}</span>
        {owner && (
          <button type="button" className="btn icon sd-links" aria-pressed={linking} aria-label={copy.link} title={copy.linkTitle} onClick={() => setLinking((x) => !x)}>
            <Link2 size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="btn icon sd-close" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {linking && <LinkPanel site={site} onBack={() => setLinking(false)} />}
      {!linking && (
        <div className="sd-studio">
          <ShareTo place={place} onPick={pickPlace} />
          <div className="sd-stage">
            <SizeBar place={place} size={size} card={look.card} look={look} today={today} first={first} onSize={setSize} onPeriod={pickPeriod} onRange={(from, to) => set({ from, to })} />
            <Preview site={site.id} look={shown} alt={copy.previewAlt(copy.cards[look.card])} />
            {placeOf(place).social ? <PostText place={place} text={text} edited={edited !== null} onChange={setEdited} onReset={() => setEdited(null)} /> : <span className="sd-note faint">{copy.sizes[sizeAt(place, size).name]} {px.w}×{px.h}</span>}
          </div>
          <CardStrip site={site.id} look={shown} tabs={tabs} group={group} onGroup={pickGroup} onPick={(t) => set({ card: t.card, ms: t.ms })} label={copy.cardsLabel} />
          {phone && (
            <button type="button" className="btn sd-style-open" aria-expanded={styling} onClick={() => setStyling((s) => !s)}>
              <Palette size={16} strokeWidth={1.8} aria-hidden="true" />
              {copy.styleTitle}
            </button>
          )}
          <aside className={'sd-side' + (styling ? ' is-open' : '')} aria-label={copy.styleTitle}>
            <div className="sd-sheet">
              <h3 className="sd-cap">{copy.styleTitle}</h3>
              <StylePanel card={look.card} style={look} onChange={style} />
            </div>
            <StudioActions place={place} shape={shape} busy={busy} done={done} link={owner} onAct={(a) => void go(a)} />
          </aside>
        </div>
      )}
    </Modal>
  )
}
