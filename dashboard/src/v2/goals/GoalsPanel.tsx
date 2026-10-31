// What the Goals menu holds: a row for each goal and saved funnel, one suggested goal to add, Track a goal, and a way to all of it.
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { fail, more, type ContentGroup, type Site } from '../../lib/apiMore'
import type { Report } from '../../lib/api'
import { can } from '../../lib/permissions'
import { copy as dialog } from '../../views/addGoalsCopy'
import { goalSuggestions } from '../../views/goalSuggestions'
import { useMorePages } from '../../views/useMorePages'
import { goExplore } from '../briefing/deeper'
import { copy } from './copy'
import { goalRows, type GoalRow } from './model'
import { openRow } from './open'
import { amountText, GoalChip, Trend } from './parts'
import { useFunnelRows } from './useFunnelRows'
import '../../components/ListPop.css'
import './goals.css'

export interface PanelProps {
  site: Site
  /** The period's report; none where it could not be read. */
  data: Report | null
  close: () => void
  onGoal?: () => void
  /** A goal was added here: the page reads its numbers again. */
  onChanged?: () => void
  /** The suggested goals, once known, so the button can stop showing its dot. */
  onSeen: (paths: string[]) => void
}

function Row({ r, go }: { r: GoalRow; go: (r: GoalRow) => void }) {
  return (
    <li>
      <button type="button" className="lrow gm-row" data-nav title={r.name} onClick={() => go(r)}>
        <GoalChip kind={r.kind} size={15} />
        <span className="gm-name">{r.name}</span>
        <span className="gm-num num">{amountText(r)}</span>
        <Trend change={r.change} />
      </button>
    </li>
  )
}

export default function GoalsPanel({ site, data, close, onGoal, onChanged, onSeen }: PanelProps) {
  const may = can('goal.create')
  const goals = data ? goalRows(data.current.goals, data.previous ? (data.previous.goals ?? []) : undefined) : []
  const funnels = useFunnelRows(site.id, { from: data?.from ?? '', to: data?.to ?? '' }, !!data?.previous, !!data)
  const more90 = useMorePages(site.id, may)
  const [cfg, setCfg] = useState<ContentGroup[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!may) return
    more.siteConfig(site.id).then((c) => setCfg(c.page_goals ?? [])).catch(() => setCfg(null))
  }, [site.id, may])
  const pages = [...(data?.current.dims.page ?? []).map((r) => r.value), ...more90]
  const suggestions = may && cfg ? goalSuggestions(pages, cfg) : []
  const next = suggestions[0]
  useEffect(() => {
    if (suggestions.length) onSeen(suggestions.map((s) => s.path))
    // Once the suggestions are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.map((s) => s.path).join('|')])
  const rows = [...goals, ...funnels]
  const go = (r: GoalRow) => {
    close()
    openRow(r)
  }
  const add = () => {
    if (!next || !cfg) return
    setBusy(true)
    more
      .siteConfig(site.id)
      .then((c) => more.setSiteConfig(site.id, { ...c, page_goals: [...(c.page_goals ?? []), next] }))
      .then(() => {
        toast(dialog.counts(next.name))
        onChanged?.()
        close()
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <>
      {rows.length > 0 && (
        <ul className="gm-list" aria-label={copy.menu}>
          {rows.map((r) => (
            <Row key={r.key} r={r} go={go} />
          ))}
        </ul>
      )}
      {(rows.length > 0 || next) && <div className="lline" role="separator" />}
      {next && (
        <button type="button" className="lrow gm-row" data-nav title={next.path} aria-label={copy.addTip(next.name)} disabled={busy} onClick={add}>
          <span className="gm-name">{next.name}</span>
          <span className="gm-kind">{copy.suggested}</span>
          <span className="end">{copy.add}</span>
        </button>
      )}
      {may && onGoal && (
        <button
          type="button"
          className="lrow gm-row"
          data-nav
          onClick={() => {
            close()
            onGoal()
          }}
        >
          <span className="gm-name">{copy.track}</span>
        </button>
      )}
      <button
        type="button"
        className="lrow gm-row dim"
        data-nav
        onClick={() => {
          close()
          goExplore()
        }}
      >
        <span className="gm-name">{copy.seeAll}</span>
      </button>
    </>
  )
}
