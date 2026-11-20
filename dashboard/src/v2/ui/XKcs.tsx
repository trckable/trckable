// The walkthrough's four numbers with their line, and the plain summary row of search, places, speed and pages.
import { fmtPct } from '../../lib/format'
import { copy } from '../explore/copy'
import { Flag } from './Flag'
import { Spark } from './KpiCard'
import { SummaryCards } from './SummaryCards'
import type { Kc, Tone, Xkc } from '../explore/types'

/** `onChip` sets the filter a card's chip stands for; a card's chip is left out where nothing can. `chipOn` is the value of the app filter now on. */
function chipOf(chip: Kc['chip'], onChip?: (dim: string, value: string) => void, chipOn?: string | null) {
  if (!chip || !onChip) return undefined
  return { text: chip.text, on: chipOn === chip.value, onClick: () => onChip(chip.dim, chip.value) }
}

export function XKcs({ items, onChip, chipOn }: { items: Kc[]; onChip?: (dim: string, value: string) => void; chipOn?: string | null }) {
  return (
    <SummaryCards
      items={items.map((k) => ({
        key: k.icon,
        data: k.icon,
        icon: k.icon,
        label: k.label,
        val: k.val,
        unit: k.unit,
        tag: k.note.t,
        tone: k.note.c as Tone,
        color: k.st === 'dn' ? 'var(--mk-red)' : (k.col ?? 'var(--mk-lime)'),
        chart:
          k.share !== undefined ? (
            <span className="sum-share"><b style={{ width: `${Math.min(100, k.share * 100)}%` }} /></span>
          ) : (
            <Spark vals={k.vals} h={24} lo={k.lo} hi={k.hi} />
          ),
        sub: k.share !== undefined ? `${fmtPct(k.share)} ${copy.ofPeople}` : undefined,
        chip: chipOf(k.chip, onChip, chipOn),
      }))}
    />
  )
}

export function XKcsPlain({ items }: { items: Xkc[] }) {
  return (
    <SummaryCards
      items={items.map((k) => ({
        key: k.label,
        label: k.label,
        val: k.val,
        unit: k.unit,
        tag: k.tag,
        tone: k.tone,
        sub: k.detail,
        icon: k.flag ? undefined : k.icon,
        mark: k.flag && <Flag code={k.flag} width={22} />,
        at: k.at,
      }))}
    />
  )
}
