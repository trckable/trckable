import { SiteMark } from '../../components/SiteMark'
import type { Site, Visit } from '../../lib/api'
import { copy } from './copy'

/** One chip per site added in the first run: its domain and whether a visit has come. */
export function SiteTabs({ sites, active, seen, onPick }: { sites: Site[]; active: string; seen: Record<string, Visit[] | undefined>; onPick: (id: string) => void }) {
  return (
    <div className="ob-sites" role="tablist" aria-label={copy.more.sites}>
      {sites.map((s) => {
        const got = (seen[s.id]?.length ?? 0) > 0
        return (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === active} className={s.id === active ? 'ob-site on' : 'ob-site'} onClick={() => onPick(s.id)}>
            <SiteMark site={s} size={16} />
            <span className="ob-site-name">{s.domain}</span>
            <i className={got ? 'ob-sdot got' : 'ob-sdot'} aria-hidden="true" />
            <span className="sr">{got ? copy.more.receiving : copy.more.waiting}</span>
          </button>
        )
      })}
    </div>
  )
}
