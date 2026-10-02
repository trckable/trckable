// The dimmed Revenue tile, for an owner whose site has no payments yet: it
// stands where the money numbers will, and a click opens the card listing the
// providers to connect. A chunk of its own, with the card it opens.
import { useState } from 'react'
import type { Site } from '../../lib/api'
import { copy } from './copy'
import { Glyph } from './Glyph'
import { ProviderCard } from './ProviderCard'
import { revenueCopy } from './revenueCopy'
import './RevenueTile.css'

export function RevenueTile({ site }: { site: Site }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="kpi dim" aria-haspopup="dialog" title={revenueCopy.connectPayments} onClick={() => setOpen(true)}>
        <span className="label kpi-name">
          <span className="kpi-ico">
            <Glyph k="revenue" />
          </span>
          {copy.revenue}
        </span>
        <span className="value num">–</span>
        <span className="kpi-delta" aria-hidden="true" />
      </button>
      {open && <ProviderCard site={site} onClose={() => setOpen(false)} />}
    </>
  )
}
