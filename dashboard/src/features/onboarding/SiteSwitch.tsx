import type { Site, Visit } from '../../lib/api'
import { copy } from './copy'

/** More than one site in the first run: the site named in the sentence is a small inline picker, and says which already have a visit. */
export function SiteSwitch({ sites, active, seen, onPick }: { sites: Site[]; active: string; seen: Record<string, Visit[] | undefined>; onPick: (id: string) => void }) {
  return (
    <select className="ob-pick" aria-label={copy.more.sites} value={active} onChange={(e) => onPick(e.target.value)}>
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.domain}
          {(seen[s.id]?.length ?? 0) > 0 ? ` · ${copy.more.receiving}` : ''}
        </option>
      ))}
    </select>
  )
}
