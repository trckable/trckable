// What to do with the picture: the download is the main action (the share sheet, on a phone), then copy it.
// A post is its text: one Copy. Where the person may manage links, Copy link puts the site's public link beside them.
import { Check, Copy, Download, Image as ImageIcon, Link2, Share2 } from 'lucide-react'
import { QUERY } from '../../kit/breakpoints'
import { useMedia } from '../../lib/useNarrow'
import { copy } from './copy'
import { canCopyImage, canShareImage } from './image'

export type Act = 'share' | 'copy' | 'save' | 'text' | 'link'

type Props = { post: boolean; /** The person may manage links: Copy link is offered. */ link?: boolean; /** The picture's pixel size, on the download button. */ size: string; busy: Act | null; done: Act | null; onAct: (a: Act) => void }

function ActButton({ act, label, title, primary, Icon, p }: { act: Act; label: string; title: string; primary?: boolean; Icon: typeof Copy; p: Props }) {
  const working = p.busy === act
  return (
    <button type="button" className={'btn sd-act' + (primary ? ' primary' : '')} data-act={act} disabled={p.busy !== null} title={title} onClick={() => p.onAct(act)}>
      {working && <span className="btn-spin" aria-hidden="true" />}
      {!working && p.done === act && <Check size={16} strokeWidth={2.4} aria-hidden="true" />}
      {!working && p.done !== act && <Icon size={16} strokeWidth={1.9} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
}

export function Actions(p: Props) {
  // On a phone the native Share is the main action; everywhere else it is the download.
  const phone = useMedia(QUERY.handheld)
  if (p.post)
    return (
      <div className="sd-actions" role="group" aria-label={copy.actions}>
        <ActButton act="text" label={copy.copyText} title={copy.copyText} primary Icon={Copy} p={p} />
        {p.link && <ActButton act="link" label={copy.copyLink} title={copy.copyLinkTitle} Icon={Link2} p={p} />}
      </div>
    )
  const share = phone && canShareImage()
  return (
    <div className="sd-actions" role="group" aria-label={copy.actions}>
      {share && <ActButton act="share" label={copy.share} title={copy.shareTitle} primary Icon={Share2} p={p} />}
      <ActButton act="save" label={copy.download(p.size)} title={copy.downloadTitle} primary={!share} Icon={Download} p={p} />
      {canCopyImage() && <ActButton act="copy" label={copy.copyImage} title={copy.copyImage} Icon={ImageIcon} p={p} />}
      {p.link && <ActButton act="link" label={copy.copyLink} title={copy.copyLinkTitle} Icon={Link2} p={p} />}
    </div>
  )
}
