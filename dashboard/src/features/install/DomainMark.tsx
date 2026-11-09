// The mark at the end of the domain field: the letter while the site's favicon
// is looked up and when it has none, then the favicon fading in over it. The
// server looks the icon up (never this page), once typing has paused.
import { useEffect, useState } from 'react'
import { SiteMark } from '../../components/SiteMark'
import { API_BASE } from '../../lib/apiBase'

export type TileState = 'letter' | 'loading' | 'icon'

/** What the tile shows: the letter until the favicon has loaded, and for good if it failed. */
export function tileState(src: string, loaded: boolean, failed: boolean): TileState {
  if (!src || failed) return 'letter'
  return loaded ? 'icon' : 'loading'
}

export const faviconSrc = (domain: string) => API_BASE + '/favicon?domain=' + encodeURIComponent(domain)

const WAIT = 400

// A phone draws marks a step larger, as SiteMark does.
const scaled = (px: number) => `calc(${px}px * var(--ph-mark, 1))`

/** The domain, once it has stopped changing for a moment and only while it is valid. */
export function useSettled(domain: string, valid: boolean): string {
  const [settled, setSettled] = useState('')
  useEffect(() => {
    if (!valid) return
    const id = setTimeout(() => setSettled(domain), WAIT)
    return () => clearTimeout(id)
  }, [domain, valid])
  // Until it settles after a change, nothing: the old icon is not this site's.
  return valid && settled === domain ? settled : ''
}

export function DomainMark({ domain, valid, size = 28 }: { domain: string; valid: boolean; size?: number }) {
  const settled = useSettled(domain, valid)
  const src = settled ? faviconSrc(settled) : ''
  const [seen, setSeen] = useState({ src: '', loaded: false, failed: false })
  const here = seen.src === src
  const state = tileState(src, here && seen.loaded, here && seen.failed)
  return (
    <span className="domain-mark" data-state={state} style={{ width: scaled(size), height: scaled(size) }}>
      <SiteMark site={{ domain: domain || '?' }} size={size} />
      {src && !(here && seen.failed) && (
        <img
          key={src}
          className="site-mark domain-mark-icon"
          src={src}
          width={size}
          height={size}
          style={{ width: scaled(size), height: scaled(size) }}
          alt=""
          aria-hidden="true"
          onLoad={() => setSeen({ src, loaded: true, failed: false })}
          onError={() => setSeen({ src, loaded: false, failed: true })}
        />
      )}
    </span>
  )
}
