// A person's sites on their row: up to three small site icons and "N of M
// sites". An owner sees them all; a viewer's button opens the popover that
// ticks them (SitesPop), saved on each tick.
import { Suspense, useRef, useState } from 'react'
import { SiteMark } from '../../components/SiteMark'
import { copy as access } from '../../features/access/copy'
import type { SiteAccess } from '../../features/access/useSiteAccess'
import type { Person } from '../../lib/api'
import { people } from './peopleCopy'
import { SitesPop } from './peopleLazy'
import { sitesSummary } from './rules'

function Stack({ marks }: { marks: Parameters<typeof SiteMark>[0]['site'][] }) {
  return (
    <span className="sites-stack" aria-hidden="true">
      {marks.map((m) => (
        <SiteMark key={m.domain} site={m} size={22} />
      ))}
    </span>
  )
}

const wording = (s: ReturnType<typeof sitesSummary>) => {
  if (s.all) return people.sites.all
  if (s.none) return people.sites.none
  return people.sites.some(s.count, s.total)
}

export function SitesButton({ p, access: acc }: { p: Person; access: SiteAccess }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const viewer = acc.of(p.id)
  if (!acc.shown) return null
  const owner = p.role === 'owner'
  // A viewer whose access is not known yet (the list is still coming) shows nothing.
  if (!owner && !viewer) return null
  const s = sitesSummary(owner ? null : (viewer?.sites ?? null), acc.sites)
  const inner = (
    <>
      <Stack marks={s.marks} />
      <span className="sites-text">{wording(s)}</span>
    </>
  )
  // Owners are never limited: nothing to open.
  if (owner || !viewer)
    return (
      <span className="sites-btn plain" title={people.sites.all}>
        {inner}
      </span>
    )
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="sites-btn"
        aria-label={access.editFor(p.email) + ': ' + wording(s)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={SitesPop.preload}
        onFocus={SitesPop.preload}
        onClick={() => setOpen((o) => !o)}
      >
        {inner}
      </button>
      {open && (
        <Suspense fallback={null}>
          <SitesPop anchor={btn} viewer={viewer} sites={acc.sites} save={acc.save} reload={acc.reload} email={p.email} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
