// A site as a small mark: its own icon when the owner set one, otherwise its
// first letter on its own colour (the brand colour, or one picked from the
// domain so it stays the same everywhere).
import { useState } from 'react'
import type { Site } from '../lib/api'

export function hueOf(domain: string): number {
  let h = 0
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** The colour a site is drawn in: its brand colour, or its domain's hue. */
export function siteColor(site: Pick<Site, 'domain' | 'color'>): string {
  return site.color || `hsl(${hueOf(site.domain)} 72% 62%)`
}

export function SiteMark({ site, size = 22 }: { site: Pick<Site, 'domain' | 'color' | 'icon_url'>; size?: number }) {
  // An icon that fails to load is the letter, never a broken picture.
  const [broken, setBroken] = useState('')
  if (site.icon_url && broken !== site.icon_url)
    return (
      <img
        className="site-mark"
        src={site.icon_url}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        style={{ background: `color-mix(in srgb, ${siteColor(site)} 16%, transparent)` }} // the letter's tile holds the box while the icon loads
        onError={() => setBroken(site.icon_url ?? '')}
      />
    )
  const c = siteColor(site)
  return (
    <span
      className="site-mark letter"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5), color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      {site.domain.replace(/^www\./, '')[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
