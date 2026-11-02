// One goal worth adding, worked out from the site's own pages; one click and it counts.
import { useState } from 'react'
import { toast } from '../../components/Toast'
import type { Row } from '../../lib/api'
import { fail, more } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { copy as dialog } from '../../views/addGoalsCopy'
import { copy } from './copy'
import { suggestionsFor } from './model'

export function SuggestedGoal({ site, pages, goals }: { site: { id: string }; pages: string[]; goals: Row[] }) {
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<string[]>([])
  const next = can('goal.create') ? suggestionsFor(pages, goals).find((s) => !added.includes(s.path)) : undefined
  if (!next) return null
  const add = () => {
    setBusy(true)
    more
      .siteConfig(site.id)
      .then((c) => ((c.page_goals ?? []).some((g) => g.name === next.name || g.path === next.path) ? c : more.setSiteConfig(site.id, { ...c, page_goals: [...(c.page_goals ?? []), next] })))
      .then(() => {
        toast(dialog.counts(next.name))
        setAdded((a) => [...a, next.path])
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <button type="button" className="xb xgoal-next" data-suggested-goal title={next.path} aria-label={copy.addTip(next.name)} disabled={busy} onClick={add}>
      {copy.suggested}: {next.name} · {copy.add}
    </button>
  )
}
