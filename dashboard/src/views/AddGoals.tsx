// "How do I track a signup?" — four answers. The first needs no code at all:
// a page seen is a goal reached, counted from the pageviews trckable already
// has, so it reads history too. The other three are one snippet each.
import { Check, Code, FileCheck, MousePointerClick, Server, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DialogActions } from '../components/DialogActions'
import { DialogHead } from '../components/DialogHead'
import { Field } from '../components/Field'
import { Modal } from '../components/Modal'
import { CodeBlock } from '../components/Code'
import { OptionCards, type Option } from '../components/OptionCards'
import { api, messageOf, type ContentGroup, type SiteConfig, type Site } from '../lib/api'
import { isViewer } from '../lib/me'
import { toast } from '../components/Toast'
import { copy } from './addGoalsCopy'
import { goalCode } from './goalCode'
import './AddGoals.css'

type Route = 'page' | 'html' | 'js' | 'api'

const ROUTES: Option<Route>[] = [
  { id: 'page', label: copy.routes.page.name, hint: copy.routes.page.hint, icon: FileCheck },
  { id: 'html', label: copy.routes.html.name, hint: copy.routes.html.hint, icon: MousePointerClick },
  { id: 'js', label: copy.routes.js.name, hint: copy.routes.js.hint, icon: Code },
  { id: 'api', label: copy.routes.api.name, hint: copy.routes.api.hint, icon: Server },
]

export function AddGoals({ site, pages, onClose, onChanged }: { site: Site; pages: string[]; onClose: () => void; onChanged: () => void }) {
  const [route, setRoute] = useState<Route>('page')
  const host = location.origin

  const code = goalCode(host, site)

  return (
    <Modal label={copy.label} className="wide" onClose={onClose}>
      <DialogHead heading={copy.title} hint={copy.hint} />
      <OptionCards label={copy.methods} options={ROUTES} value={route} onChange={setRoute} />
      {route === 'page' ? (
        <PageGoals site={site} pages={pages} onChanged={onChanged} onClose={onClose} />
      ) : (
        <>
          <CodeBlock code={code[route]} />
          <span className="faint goal-hint">{copy.hints[route]}</span>
          <DialogActions>
            <button type="button" className="btn primary big" onClick={onClose}>
              {copy.done}
            </button>
          </DialogActions>
        </>
      )}
    </Modal>
  )
}

/** Goals that are pages: the ones already set up, a name, a path. */
function PageGoals({ site, pages, onChanged, onClose }: { site: Site; pages: string[]; onChanged: () => void; onClose: () => void }) {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const viewer = isViewer()
  useEffect(() => {
    api.siteConfig(site.id).then(setCfg).catch(() => setCfg(null))
  }, [site.id])
  const goals = cfg?.page_goals ?? []

  const save = (next: ContentGroup[], said: string) => {
    if (!cfg) return
    setBusy(true)
    api
      .setSiteConfig(site.id, { ...cfg, page_goals: next })
      .then((r) => {
        setCfg(r)
        toast(said)
        onChanged()
      })
      .catch((e: unknown) => toast(messageOf(e), 'error'))
      .finally(() => setBusy(false))
  }
  const add = () => {
    const n = name.trim()
    let p = path.trim()
    if (p && !p.startsWith('/')) p = '/' + p
    if (!n || !p) return
    if (goals.some((g) => g.name === n)) {
      setNameErr(copy.exists)
      return
    }
    save([...goals, { name: n, path: p }], copy.counts(n))
    setName('')
    setPath('')
  }

  return (
    <>
      {goals.length > 0 && (
        <ul className="pg-list" aria-label={copy.added}>
          {goals.map((g) => (
            <li key={g.name}>
              <Check size={15} strokeWidth={2} aria-hidden="true" />
              <b>{g.name}</b>
              <code className="num">{g.path}</code>
              {!viewer && (
                <button type="button" className="btn icon ghost" aria-label={copy.remove(g.name)} title={copy.removeTip} disabled={busy} onClick={() => save(goals.filter((x) => x.name !== g.name), copy.removed(g.name))}>
                  <X size={15} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {viewer ? (
        <p className="muted goal-viewer">{copy.viewer}</p>
      ) : (
        <form
          id="pg-form"
          className="goal-fields"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Field label={copy.name} error={nameErr}>
            {(f) => (
              <input
                {...f}
                className="input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameErr(null)
                }}
                placeholder={copy.namePlaceholder}
                maxLength={60}
              />
            )}
          </Field>
          <Field label={copy.page} help={copy.pageHelp}>
            {(f) => <input {...f} className="input mono" list="pg-pages" value={path} onChange={(e) => setPath(e.target.value)} placeholder={copy.pagePlaceholder} maxLength={200} />}
          </Field>
          <datalist id="pg-pages">
            {pages.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </form>
      )}
      <DialogActions
        left={
          <button type="button" className="btn ghost" onClick={onClose}>
            {copy.done}
          </button>
        }
      >
        {!viewer && (
          <button type="submit" form="pg-form" className="btn primary big" disabled={busy || !cfg || !name.trim() || !path.trim()}>
            {copy.add}
          </button>
        )}
      </DialogActions>
    </>
  )
}
