// What a link shows besides the headline numbers: which sections of Explore, and whether the
// period is fixed or the reader chooses. The server holds both: a section left off is refused,
// not only left out of the page.
import { LayoutGrid, CalendarRange } from 'lucide-react'
import { PRESETS } from '../../lib/dates'
import { copy } from './copy'
import { PERIODS, SECTIONS, type Draft } from './logic'
import { Opt } from './Opt'

const periodName = (id: string) => PRESETS.find((p) => p.id === id)?.label ?? id

export function Scope({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const flip = (s: string) => set({ sections: draft.sections.includes(s) ? draft.sections.filter((x) => x !== s) : [...draft.sections, s] })
  return (
    <>
      <Opt
        icon={<LayoutGrid size={15} strokeWidth={1.75} />}
        label={copy.sections}
        below={
          <div className="seg small sl-sections" role="group" aria-label={copy.sections}>
            {SECTIONS.map((s) => (
              <button key={s} type="button" aria-pressed={draft.sections.includes(s)} onClick={() => flip(s)}>
                {copy.sectionNames[s]}
              </button>
            ))}
          </div>
        }
      >
        <span className="faint sl-opt-note">{draft.sections.length === SECTIONS.length ? copy.sectionsAll : copy.sectionsSome(draft.sections.length)}</span>
      </Opt>
      <Opt icon={<CalendarRange size={15} strokeWidth={1.75} />} label={copy.period}>
        <select className="input sl-select" aria-label={copy.period} value={draft.period} onChange={(e) => set({ period: e.target.value })}>
          <option value="">{copy.periodChoose}</option>
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {periodName(p)}
            </option>
          ))}
        </select>
      </Opt>
    </>
  )
}
