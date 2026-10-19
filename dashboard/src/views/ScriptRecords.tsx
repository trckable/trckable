// Settings → General → What the script records. Most of trckable has no
// switch: it is simply there. These are the few things that change what the
// browser sends, so each line shows what it adds to the script. Turning one
// off stops new data and never deletes what was recorded.
import { useEffect, useState } from 'react'
import { confirm } from '../components/Confirm'
import { Row } from '../components/Row'
import { Switch } from '../components/Switch'
import { Loading } from '../components/loading/Loading'
import { api, fail, more, type ModuleInfo, type ScriptInfo, type Site } from '../lib/apiMore'
import { words } from '../lib/errors'
import { can } from '../lib/permissions'
import { settingsParam } from '../lib/settings'
import { modulesChanged } from '../lib/useMods'
import { recordsCopy } from './recordsCopy'
import './ScriptRecords.css'

const bytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(2)} KB` : `${n} B`)
/** A choice's name in the language of the page (the server's list is English). */
const nameOf = (id: string): string => (id === 'outbound' || id === 'forms' ? recordsCopy[id] : recordsCopy[id as 'goals' | 'vitals' | 'heatmaps'].name)
const cost = (m: ModuleInfo | undefined) => (m?.tracker_bytes ? recordsCopy.adds(bytes(m.tracker_bytes)) : recordsCopy.free)

/** `titled` is off where a heading of its own already says it (the Tracking options pop-up). */
export function ScriptRecords({ site, titled = true }: { site: Site; titled?: boolean }) {
  const [mods, setMods] = useState<ModuleInfo[] | null>(null)
  const [script, setScript] = useState<ScriptInfo | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const take = (d: { modules: ModuleInfo[]; script: ScriptInfo }) => {
    setMods(d.modules)
    setScript(d.script)
  }
  useEffect(() => {
    api.modules(site.id).then(take).catch((e: unknown) => setErr(words(e)))
  }, [site.id])

  // An old link to the Modules tab lands here.
  useEffect(() => {
    if (!mods || settingsParam('focus') !== 'script-records') return
    document.getElementById('script-records')?.scrollIntoView({ block: 'start' })
    // Live's speed "Set up" lands on the switch it is about.
    if (settingsParam('want') === 'vitals') document.getElementById('rec-vitals')?.focus()
  }, [mods])
  const get = (id: string) => mods?.find((m) => m.id === id)
  // Turning one off loses what it would have recorded from now on: say so first.
  const change = async (id: string, enabled: boolean) => {
    const gap = recordsCopy.gap[id as keyof typeof recordsCopy.gap]
    if (!enabled && gap && !(await confirm({ title: recordsCopy.offTitle(nameOf(id)), body: [gap, id === 'goals' ? recordsCopy.withGoals : '', recordsCopy.offStays].filter(Boolean).join(' '), confirmLabel: recordsCopy.turnOff, cancelLabel: recordsCopy.keep, danger: true }))) return
    set(id, enabled)
  }
  const set = (id: string, enabled: boolean) => {
    setBusy(id)
    more
      .setModule(site.id, id, enabled)
      .then((d) => {
        take(d)
        modulesChanged() // the dashboard behind reads them again
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(''))
  }
  const goals = get('goals')
  const sub = (id: 'outbound' | 'forms') => {
    const m = get(id)
    return (
      <label className="rec-sub">
        <input type="checkbox" checked={!!m?.enabled} disabled={!goals?.enabled || busy === id || !can('site.settings')} onChange={(e) => void change(id, e.target.checked)} />
        <span>{recordsCopy[id]}</span>
        <span className="faint num">{cost(m)}</span>
      </label>
    )
  }
  const line = (id: 'goals' | 'vitals' | 'heatmaps', children?: React.ReactNode) => {
    const m = get(id)
    return (
      <>
        <Row label={recordsCopy[id].name} hint={`${recordsCopy[id].hint} ${cost(m)}`}>
          <Switch id={`rec-${id}`} on={!!m?.enabled} disabled={busy === id || !can('site.settings')} onChange={() => void change(id, !m?.enabled)} />
        </Row>
        {children}
      </>
    )
  }

  return (
    <section className="card" id="script-records" style={{ gap: 0 }}>
      <div className="card-head">
        {titled && <h2>{recordsCopy.title}</h2>}
        {script && <span className="faint num">{recordsCopy.total(bytes(script.bytes))}</span>}
      </div>
      <p className="faint rec-lead">{recordsCopy.lead}</p>
      {err && <div className="banner" role="alert">{err}</div>}
      {!mods && !err && <Loading height={120} />}
      {mods && (
        <>
          {line('goals', <div className="rec-subs">{sub('outbound')}{sub('forms')}</div>)}
          {line('vitals')}
          {line('heatmaps')}
        </>
      )}
      <span className="faint rec-foot">{recordsCopy.foot}</span>
    </section>
  )
}
