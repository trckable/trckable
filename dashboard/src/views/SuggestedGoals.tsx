// Goals offered from the pages this site has really recorded, one click each,
// and one row to count form submissions when that switch is off.
import { useEffect, useState } from 'react'
import { api, fail, more, type ContentGroup, type ModuleInfo, type Site } from '../lib/apiMore'
import { can } from '../lib/permissions'
import { toast } from '../components/Toast'
import { copy as all } from './addGoalsCopy'
import { goalSuggestions } from './goalSuggestions'

const copy = all.suggested

export function SuggestedGoals({ site, pages, goals, busy, onAdd }: { site: Site; pages: string[]; goals: ContentGroup[]; busy: boolean; onAdd: (g: ContentGroup) => void }) {
  const [mods, setMods] = useState<ModuleInfo[] | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.modules(site.id).then((d) => setMods(d.modules)).catch(() => setMods(null))
  }, [site.id])
  const on = (id: string) => mods?.find((m) => m.id === id)?.enabled
  const forms = !!mods && !on('forms') && !!on('goals') && can('site.settings')
  const list = goalSuggestions(pages, goals)
  if (!list.length && !forms) return null

  const turnOnForms = () => {
    setSaving(true)
    more
      .setModule(site.id, 'forms', true)
      .then((d) => {
        setMods(d.modules)
        toast(copy.formsOn)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setSaving(false))
  }
  const row = (name: string, path: string, run: () => void, off: boolean) => (
    <li key={name}>
      <b>{name}</b>
      <code className="num">{path}</code>
      <button type="button" className="btn ghost" aria-label={copy.addTip(name)} disabled={off} onClick={run}>
        {copy.add}
      </button>
    </li>
  )
  return (
    <section className="pg-suggest">
      <h3 className="faint">{copy.heading}</h3>
      <ul className="pg-list" aria-label={copy.heading}>
        {list.map((s) => row(s.name, s.path, () => onAdd(s), busy))}
        {forms && row(copy.forms, copy.formsPath, turnOnForms, saving)}
      </ul>
    </section>
  )
}
