// "How do I track a signup?" — four answers. The first needs no code at all:
// a page seen is a goal reached, counted from the pageviews trckable already
// has, so it reads history too. The other three are one snippet each.
import { Code, FileCheck, MousePointerClick, Server } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { CodeBlock } from '../components/Code'
import { api, type ContentGroup, type SiteConfig, type Site } from '../lib/api'
import { isViewer } from '../lib/me'
import { toast } from '../components/Toast'

type Route = 'page' | 'html' | 'js' | 'api'

const ROUTES: { id: Route; name: string; what: string; icon: typeof Code }[] = [
  { id: 'page', name: 'When a page is visited', what: 'No code at all', icon: FileCheck },
  { id: 'html', name: 'On a button or link', what: 'One attribute, no code', icon: MousePointerClick },
  { id: 'js', name: 'From your code', what: 'A call when something succeeds', icon: Code },
  { id: 'api', name: 'From your server', what: 'For anything the browser never sees', icon: Server },
]

export function AddGoals({ site, pages, onClose, onChanged }: { site: Site; pages: string[]; onClose: () => void; onChanged: () => void }) {
  const [route, setRoute] = useState<Route>('page')
  const host = location.origin

  const code: Record<Exclude<Route, 'page'>, string> = {
    html: `<button data-trckable-goal="signup">Create account</button>

<!-- with properties -->
<button data-trckable-goal="signup" data-trckable-plan="pro">Go pro</button>`,
    js: `// after the thing actually succeeded
trckable('goal', 'signup', { plan: 'pro' })

// or from the npm package
import { track } from 'trckable'
track('signup', { plan: 'pro' })`,
    api: `curl -X POST ${host}/api/e \\
  -H 'content-type: application/json' \\
  -d '{"s":"${site.id}","u":"https://${site.domain}/welcome",
       "e":"goal","n":"signup","p":{"plan":"pro"},
       "id":"<visitor id from the cookie>","pv":"<pageview id>"}'`,
  }

  return (
    <Modal label="Add goals" className="wide" onClose={onClose}>
      <h2>Track a goal</h2>
      <p className="muted" style={{ margin: 0 }}>
        A goal is anything worth counting: a signup, a trial, a download. Mark it once and it appears here, with the sources and pages that produced it.
      </p>

      <div className="goal-routes">
        {ROUTES.map((r) => (
          <button key={r.id} type="button" className={route === r.id ? 'mtile on' : 'mtile'} aria-pressed={route === r.id} onClick={() => setRoute(r.id)} style={{ minWidth: 0, flex: 1 }}>
            <r.icon size={19} strokeWidth={1.75} aria-hidden="true" />
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
              {r.name}
              <span className="faint" style={{ fontSize: 11 }}>
                {r.what}
              </span>
            </span>
          </button>
        ))}
      </div>

      {route === 'page' ? (
        <PageGoals site={site} pages={pages} onChanged={onChanged} />
      ) : (
        <>
      <CodeBlock code={code[route as Exclude<Route, 'page'>]} />
      <span className="faint" style={{ fontSize: 12 }}>
        {route === 'html'
          ? 'Any element works. Extra data-trckable-* attributes become properties you can break the goal down by.'
          : route === 'js'
            ? 'Call it when the action succeeded, not when the button was clicked — a failed signup is not a signup.'
            : 'Server-side goals need the visitor id from the trckable_vid cookie, so the goal lands on the right visit.'}
      </span>
        </>
      )}

      <DialogActions>
        <button type="button" className="btn primary big" onClick={onClose}>
          Done
        </button>
      </DialogActions>
    </Modal>
  )
}

/** Goals that are pages: a name, a path, and the ones already set up. */
function PageGoals({ site, pages, onChanged }: { site: Site; pages: string[]; onChanged: () => void }) {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
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
      .catch((e: Error) => toast(e.message, 'error'))
      .finally(() => setBusy(false))
  }
  const add = () => {
    const n = name.trim()
    let p = path.trim()
    if (p && !p.startsWith('/')) p = '/' + p
    if (!n || !p) return
    if (goals.some((g) => g.name === n)) return toast('There is already a goal with that name', 'error')
    save([...goals, { name: n, path: p }], `"${n}" counts from now on, and for the past too`)
    setName('')
    setPath('')
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <span className="faint" style={{ fontSize: 12.5 }}>
        Reached by any visit that sees the page. It is counted from the pageviews already recorded, so it shows the past as well. End a path
        with * for everything under it, like /blog/*.
      </span>
      {viewer ? (
        <p className="muted" style={{ margin: 0 }}>Your account reads this site. An owner adds goals.</p>
      ) : (
        <form
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <label style={{ display: 'grid', gap: 4, flex: '1 1 180px', fontSize: 12.5 }}>
            <span className="muted">Goal name</span>
            <input id="pg-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Saw pricing" maxLength={60} />
          </label>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 200px', fontSize: 12.5 }}>
            <span className="muted">Page</span>
            <input id="pg-path" className="input mono" list="pg-pages" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/pricing" maxLength={200} />
            <datalist id="pg-pages">
              {pages.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <button type="submit" className="btn primary" disabled={busy || !cfg || !name.trim() || !path.trim()}>
            Add goal
          </button>
        </form>
      )}
      {goals.length > 0 && (
        <ul className="pg-list" aria-label="Page goals">
          {goals.map((g) => (
            <li key={g.name}>
              <b>{g.name}</b>
              <code className="num">{g.path}</code>
              {!viewer && (
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={`Remove the goal ${g.name}`}
                  disabled={busy}
                  onClick={() => save(goals.filter((x) => x.name !== g.name), `"${g.name}" removed`)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
