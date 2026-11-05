// The header's Share: a picture of the page's numbers for a post, in a sheet over the page. Anyone who can see the
// numbers may share a picture of them; the public link inside the sheet needs the right to manage links.
import { Share2 } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { periodOf } from './card'
import { copy } from './copy'
import './ShareButton.css'

/** The page's Share key opens the sheet through this. */
export const SHARE_EVENT = 'trckable:share'

const ShareDialog = lazyLoad(() => import('./ShareDialog'))

export function ShareButton({ site, sites, period }: { site: Site; sites: Site[]; period?: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(SHARE_EVENT, on)
    return () => window.removeEventListener(SHARE_EVENT, on)
  }, [])
  return (
    <>
      <button type="button" className="mk-chip share-chip" title={copy.buttonTitle} {...warm(ShareDialog.preload)} onClick={() => setOpen(true)}>
        <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="t2">{copy.button}</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <ShareDialog site={site} sites={sites} period={periodOf(period)} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
