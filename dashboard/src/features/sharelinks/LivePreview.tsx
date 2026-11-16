// What the link's reader will see: the real shared page, drawn small. It is the page itself, opened through a
// short-lived link of its own that the server keeps for this person and these options (sections, period, revenue,
// notes, the site's look), so nothing here is a drawing that could differ from it. A change shows after a breath.
import { Eye, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fail, more } from '../../lib/apiMore'
import { copy } from './copy'

export interface PreviewOptions {
  name: string
  revenue: boolean
  notes: boolean
  sections: string[]
  period: string
}

/** The widths the page is laid out at before it is scaled down to the box: the wide page, and the phone's. */
const WIDE = { w: 1280, h: 860 }
const PHONE = { w: 440, h: 820 }
const PHONE_BELOW = 520

/** How long a change is waited on before the page is asked for again: a typed name is one request, not one per letter. */
const WAIT = 450

interface Props {
  site: string
  /** The address bar's host: the site's own domain for its links, or this server's. */
  host: string
  options: PreviewOptions
  /** Show the password page instead of the numbers; absent, there is no switch for it. */
  lock?: boolean
  onLock?: () => void
  /** Moves when what the page is drawn from changed behind the options (the site's look was saved): the page is asked for again. */
  version?: number
}

export function LivePreview({ site, host, options, lock, onLock, version = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [src, setSrc] = useState('')
  const [loaded, setLoaded] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const key = JSON.stringify([options, lock, version])
  useEffect(() => {
    const mine = ++seq.current
    const timer = setTimeout(() => {
      more
        .previewShare(site, { ...options, lock: !!lock })
        .then((r) => {
          if (mine !== seq.current) return
          setLoaded(false)
          setSrc(r.path + '?preview=1')
        })
        .catch((e: unknown) => mine === seq.current && fail(e))
    }, WAIT)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the options, as one value
  }, [site, key])
  const size = width && width < PHONE_BELOW ? PHONE : WIDE
  const scale = width ? width / size.w : 0
  return (
    <div className="sl-preview">
      <div className="sl-preview-head">
        <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>{copy.preview}</span>
        {onLock && (
          <button type="button" className="sl-lock" aria-pressed={!!lock} aria-label={lock ? copy.pageScreen : copy.lockScreen} title={lock ? copy.pageScreen : copy.lockScreen} onClick={onLock}>
            <Lock size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="sl-frame">
        <div className="sl-chrome" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>{host}/s/······</span>
        </div>
        <div ref={box} className={loaded ? 'sl-live loaded' : 'sl-live'} style={scale ? { height: size.h * scale } : undefined}>
          {src && scale > 0 && (
            <iframe key={src} className="sl-live-page" title={copy.previewTitle} src={src} tabIndex={-1} style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} onLoad={() => setLoaded(true)} />
          )}
          {!loaded && <span className="sl-live-wait skeleton" aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}
