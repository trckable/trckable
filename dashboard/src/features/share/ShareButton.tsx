// The header's Share: a picture of the page's numbers for a post, in a sheet over the page. Anyone who can see the
// numbers may share a picture of them; the public link inside the sheet needs the right to manage links.
import { Share2 } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { QUERY } from '../../kit/breakpoints'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { useMedia } from '../../lib/useNarrow'
import { periodOf, type Period, type Topic } from './card'
import { copy } from './copy'
import './ShareButton.css'

/** The page's Share key, and the ⋯ menu's "Share a picture" on a phone, open the sheet through this. */
export const SHARE_EVENT = 'trckable:share'

/** What a section asks of the sheet: its own topic and the page's period. */
export type ShareAsk = { topic?: Topic; period?: Period }

/** Opens the sheet, on a topic and period when the page has them. */
export const openShare = (ask?: ShareAsk) => window.dispatchEvent(new CustomEvent<ShareAsk | undefined>(SHARE_EVENT, { detail: ask }))

const ShareDialog = lazyLoad(() => import('./ShareDialog'))

export function ShareButton({ site, sites, period }: { site: Site; sites: Site[]; period?: string }) {
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState<ShareAsk>()
  // A phone's header has no room for it: Share is in the page's ⋯ menu there, and this only holds the sheet.
  const handheld = useMedia(QUERY.handheld)
  useEffect(() => {
    const on = (e: Event) => {
      setAsk((e as CustomEvent<ShareAsk | undefined>).detail)
      setOpen(true)
    }
    window.addEventListener(SHARE_EVENT, on)
    return () => window.removeEventListener(SHARE_EVENT, on)
  }, [])
  return (
    <>
      {!handheld && (
        <button type="button" className="mk-chip share-chip" title={copy.buttonTitle} {...warm(ShareDialog.preload)} onClick={() => setOpen(true)}>
          <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className="t2">{copy.button}</span>
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <ShareDialog site={site} sites={sites} period={ask?.period ?? periodOf(period)} topic={ask?.topic} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
