// Settings → General → Reports (Privacy.tsx's ReportSettings): when weeks
// start and whether the part after # is a page of its own.
import { Row } from '../components/Row'
import { Switch } from '../components/Switch'
import type { SiteConfig } from '../lib/api'

export function ReportRows({ config: c, onSave: save }: { config: SiteConfig; onSave: (patch: Partial<SiteConfig>, said?: string) => void }) {
  return (
    <>
      <Row label="Week starts on" hint="“This week”, weekly charts, the calendar and the weekly report all start on this day">
        <div className="seg" role="group" aria-label="Week starts on">
          <button type="button" aria-pressed={c.week_start === 1} onClick={() => save({ week_start: 1 }, 'Weeks start on Monday')}>
            Monday
          </button>
          <button type="button" aria-pressed={c.week_start === 0} onClick={() => save({ week_start: 0 }, 'Weeks start on Sunday')}>
            Sunday
          </button>
        </div>
      </Row>
      <Row label="Pages after the #" hint="For apps routed like /#/pricing: the part after # counts as its own page. Add data-hash to the snippet too. Off, it is dropped, as it is for anchors">
        <Switch on={!!c.hash_mode} onChange={() => save({ hash_mode: !c.hash_mode }, c.hash_mode ? 'The part after # is dropped again' : 'The part after # now counts as the page')} />
      </Row>
    </>
  )
}
