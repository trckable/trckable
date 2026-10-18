// A page with no data because the site has had no visit yet: the desk lamp sweeping, one line, one hint.
import { Figure } from '../../figures/Figure'
import { waiting as t } from '../copy'

export function Waiting() {
  return (
    <div className="mk-waiting">
      <Figure name="lamp" minWidth={641} className="mk-waiting-fig" />
      <b>{t.title}</b>
      <span className="mk-quiet">{t.hint}</span>
    </div>
  )
}
