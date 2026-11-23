// What to do with the card: the one main action for the place (post, download or copy the link), then the image and the link on their own. Each says what it does.
import { Check, Download, Link2, Send } from 'lucide-react'
import { formatOf, type Shape } from './card'
import { copy } from './copy'
import type { Place } from './places'

export type Act = 'main' | 'save' | 'link'
type Props = { place: Place; shape: Shape; busy: Act | null; done: Act | null; link: boolean; onAct: (a: Act) => void }

/** The button's mark: a spinner while it works, a tick when it is done, else its own icon. */
function mark(working: boolean, done: boolean, Icon: typeof Send) {
  if (working) return <span className="btn-spin" aria-hidden="true" />
  if (done) return <Check size={16} strokeWidth={2.4} aria-hidden="true" />
  return <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
}

const mainIcon = (place: Place) => ({ download: Download, email: Link2 })[place as string] ?? Send

function Line({ act, title, note, primary, Icon, p, off }: { act: Act; title: string; note: string; primary?: boolean; Icon: typeof Send; p: Props; off?: boolean }) {
  const working = p.busy === act
  return (
    <button type="button" className={'sd-act' + (primary ? ' is-main' : '')} data-act={act} disabled={p.busy !== null || off} onClick={() => p.onAct(act)}>
      {mark(working, p.done === act, Icon)}
      <span className="sd-act-text">
        <b>{title}</b>
        <span>{note}</span>
      </span>
    </button>
  )
}

export function StudioActions(p: Props) {
  const { place, done } = p
  const f = formatOf(p.shape)
  const px = `${f.w}×${f.h}`
  const anywhere = place === 'download' || place === 'email'
  const mainTitle = done === 'main' ? copy.mainDone[place] : copy.main[place]
  const needsLink = place !== 'download' && !(place === 'instagram')
  return (
    <div className="sd-actions" role="group" aria-label={copy.actions}>
      <Line act="main" primary title={mainTitle} note={place === 'download' ? copy.png(px) : copy.mainNote[place]} Icon={mainIcon(place)} p={p} off={needsLink && !p.link} />
      <Line act="save" title={done === 'save' ? copy.saved : copy.downloadImage} note={copy.downloadNote(px, anywhere ? copy.anywhere : copy.places[place])} Icon={Download} p={p} />
      <Line act="link" title={done === 'link' ? copy.linkCopied : copy.copyLink} note={copy.copyLinkNote} Icon={Link2} p={p} off={!p.link} />
    </div>
  )
}
