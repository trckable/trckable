// The header's band: both rows together. It scrolls away with the page; only
// the control line under it (ControlRow) stays at the top.
import type { ReactNode } from 'react'

export function HeaderBand({ children }: { children: ReactNode }) {
  return <div className="hdr-band">{children}</div>
}
