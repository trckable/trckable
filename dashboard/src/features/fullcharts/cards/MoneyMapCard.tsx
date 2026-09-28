// Revenue by country: the dashboard's own map, shaded by attributed revenue
// in the money colour instead of visitors in the accent.
import { lazy, Suspense, useMemo } from 'react'
import { ChartCard } from '../../../charts/ChartCard'
import type { Row } from '../../../lib/api'
import { copy } from '../copy'
import { moneyMapModel } from '../model'
import { Loading } from '../../../components/loading/Loading'

const WorldMap = lazy(() => import('../../../views/WorldMap').then((m) => ({ default: m.WorldMap })))

export function MoneyMapCard({ rows, fmtMoney, onPick }: { rows: Row[]; fmtMoney: (n: number) => string; onPick: (code: string) => void }) {
  const m = moneyMapModel(rows, fmtMoney)
  const metric = useMemo(
    () => ({ get: (r: Row) => r.revenue ?? 0, fmt: fmtMoney, label: copy.map.label, foot: copy.map.countries, color: 'var(--money)' }),
    [fmtMoney],
  )
  return (
    <ChartCard id="money-map" title={copy.map.title} question={copy.map.question} table={m.table} empty={m.rows.length === 0}>
      <Suspense fallback={<Loading height={190} />}>
        <WorldMap rows={m.rows} onPick={onPick} metric={metric} />
      </Suspense>
    </ChartCard>
  )
}
