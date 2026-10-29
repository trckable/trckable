// Which goal is the site's signup: the one behind the Briefing's Signups figure, the Explore column and the moment in Live.
// Automatic picks the goal that is called one; None switches the figures off.
import { useEffect, useState } from 'react'
import { Field } from '../components/Field'
import { toast } from '../components/Toast'
import { SIGNUP_NONE, type Row } from '../lib/api'
import { fail, type Site, type SiteConfig, more } from '../lib/apiMore'
import { can } from '../lib/permissions'
import { copy } from './addGoalsCopy'

const AUTO = ''

export function SignupChoice({ site, goals, onChanged }: { site: Site; goals: Pick<Row, 'value' | 'label'>[]; onChanged: () => void }) {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    more.siteConfig(site.id).then(setCfg).catch(() => setCfg(null))
  }, [site.id])
  if (!cfg || goals.length === 0) return null
  const c = copy.signup
  const now = cfg.signup_goal ?? AUTO
  const named = (v: string) => goals.find((g) => g.value === v)?.label || v
  const said = (v: string) => {
    if (v === AUTO) return c.savedAuto
    return v === SIGNUP_NONE ? c.savedNone : c.saved(named(v))
  }
  const pick = (v: string) => {
    setBusy(true)
    more
      .setSiteConfig(site.id, { ...cfg, signup_goal: v })
      .then((r) => {
        setCfg(r)
        toast(said(v))
        onChanged()
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <Field label={c.label} help={c.help}>
      {(f) => (
        <select {...f} className="input" value={now} disabled={busy || !can('goal.create')} onChange={(e) => pick(e.target.value)}>
          <option value={AUTO}>{c.auto}</option>
          {goals.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label || g.value}
            </option>
          ))}
          <option value={SIGNUP_NONE}>{c.none}</option>
        </select>
      )}
    </Field>
  )
}
