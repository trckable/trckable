// What the map says in numbers, beside it: the most clicked elements (with
// their dead and rage clicks) and the form fields people reached and left a
// form at. Elements are named by their selector, fields by their name.
import type { HeatMap } from './api'
import { heatCopy } from './copy'
import { fmtInt } from '../../lib/format'

export function HeatSide({ map }: { map: HeatMap }) {
  const top = map.clicks.length + map.dead.length > 0 ? map.elements.slice(0, 8) : []
  const most = Math.max(1, ...top.map((e) => e.clicks + e.dead))
  const reached = Math.max(1, ...map.fields.map((f) => f.reached))
  return (
    <aside className="heat-side">
      {top.length > 0 && (
        <section>
          <h3>{heatCopy.elements}</h3>
          <ul>
            {top.map((e) => (
              <li key={e.el} title={e.el}>
                <span className="heat-name">{e.el}</span>
                <span className="heat-n num">{fmtInt(e.clicks)}</span>
                <i style={{ width: `${((e.clicks + e.dead) / most) * 100}%` }} />
                {(e.dead > 0 || e.rage > 0) && (
                  <span className="heat-bad num">
                    {e.dead > 0 && <span title={heatCopy.deadTip}>{`${heatCopy.dead} ${fmtInt(e.dead)}`}</span>}
                    {e.rage > 0 && <span title={heatCopy.rageTip}>{`${heatCopy.rage} ${fmtInt(e.rage)}`}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {map.fields.length > 0 && (
        <section>
          <h3>{heatCopy.forms}</h3>
          <ul>
            {map.fields.map((f) => (
              <li key={f.form + f.field} title={`${f.form} > ${f.field}`}>
                <span className="heat-name">{f.field}</span>
                <span className="heat-n num" title={heatCopy.reached}>{fmtInt(f.reached)}</span>
                <i style={{ width: `${(f.reached / reached) * 100}%` }} />
                {f.left > 0 && <span className="heat-bad num" title={heatCopy.left}>{`${heatCopy.left} ${fmtInt(f.left)}`}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
