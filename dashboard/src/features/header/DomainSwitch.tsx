// For a site seen on more than one domain: publishes the "Domain is …" choice to the site
// switcher (lib/domainControl), which holds the row that picks, while the header says
// "· All" or the domain picked after the site's name. It draws nothing itself. The address
// holds the one state, so the chip row and this control always agree.
import { useEffect } from 'react'
import type { Filter, Row } from '../../lib/api'
import { publishDomains } from '../../lib/domainControl'

export interface DomainSwitchProps {
  /** The report's list of domains, when it carries one (two or more seen). */
  seen: Row[] | null
  filters: Filter[]
  site: string
  /** Kept for the hosted wrapper: the control is the same at every width. */
  narrow?: boolean
  /** A domain, or null for all. */
  onPick: (host: string | null) => void
}

export function DomainSwitch({ seen, filters, site, onPick }: DomainSwitchProps) {
  const rows = seen ?? []
  const on = rows.length > 0
  useEffect(() => {
    publishDomains(on ? { seen: rows, filters, site, onPick } : null)
  })
  useEffect(() => () => publishDomains(null), [])
  return null
}
