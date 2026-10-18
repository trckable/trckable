import { Activity, Check, ChevronRight, CircleCheck, Info as InfoIcon, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type InstallCheck, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { Install } from '../features/install/Install'
import { clock } from '../lib/site'

/** Once visits arrive, Install becomes a check you can run: this server reads
 *  the homepage and looks for the snippet, and the latest recorded visit says
 *  whether the script is sending. The code stays one click away. */
export function InstallSection({ site }: { site: Site }) {
  const [last, setLast] = useState<{ ts: number; path?: string } | null | undefined>(undefined)
  const [page, setPage] = useState<InstallCheck | null>(null)
  // Which checks are still running. Each one resolves on its own, in order,
  // and never faster than the eye can follow: a check that answers in 20 ms
  // looked as if the button did nothing.
  const [pend, setPend] = useState({ page: true, visits: false })
  const [at, setAt] = useState<Date | null>(null)
  const [code, setCode] = useState<boolean | null>(null) // null: open when not verified
  const checking = pend.page || pend.visits
  const latest = () =>
    api
      .events(site.id, 1)
      .then((r) => (r.events[0] ? { ts: Number(r.events[0].ts) || Date.parse(r.events[0].ts), path: r.events[0].path } : null))
      .catch(() => null)
  const check = async (visits: boolean) => {
    const t0 = Date.now()
    const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms - (Date.now() - t0))))
    setPend({ page: true, visits })
    const pageP = more.checkInstall(site.id).catch((e: unknown): InstallCheck => ({ url: `https://${site.domain}/`, scripts: 0, error: words(e) }))
    const lastP = visits ? latest() : null
    const [pg] = await Promise.all([pageP, wait(750)])
    setPage(pg)
    setPend((p) => ({ ...p, page: false }))
    if (lastP) {
      const [l] = await Promise.all([lastP, wait(1400)])
      if (l) setLast(l)
    }
    setPend({ page: false, visits: false })
    setAt(new Date())
  }
  useEffect(() => {
    // The latest visit decides what this tab is: the install steps, or the check.
    void latest().then((l) => {
      setLast(l)
      if (l) void check(false)
    })
  }, [site.id]) // eslint-disable-line react-hooks/exhaustive-deps -- latest and check are new functions every render; this runs once per site
  if (last === undefined) return <div className="skeleton" style={{ height: 88 }} />
  if (last === null) return <Install site={site} visits={[]} variant="settings" />

  const fresh = withinDay(last.ts)
  const seen = `${agoText(last.ts)}${last.path ? ` on ${last.path}` : ''}`
  const where = page?.url.replace(/^https?:\/\//, '').replace(/\/$/, '') || site.domain
  const scripts = page ? `${page.scripts} script${page.scripts === 1 ? '' : 's'}` : ''
  // Three things, in the order they are checked. Only the second can verify
  // the install: this site's own id, found where a browser would load it.
  const reachStep = (): Step => {
    if (!page || pend.page) return { tone: 'wait', title: 'Your homepage', text: `Loading https://${site.domain}/…` }
    if (page.error) return { tone: 'warn', title: 'Your homepage', text: `${page.error}.` }
    return { tone: 'ok', title: 'Your homepage', text: `${where} answered (${page.status}).` }
  }
  const snippetStep = (): Step => {
    if (!page || pend.page) return { tone: 'wait', title: "This site's snippet", text: 'Looking in the page and the scripts it loads…' }
    if (page.error) return { tone: 'info', title: "This site's snippet", text: 'Not checked: the page could not be read.' }
    if (page.found === 'site')
      return {
        tone: 'ok',
        title: "This site's snippet",
        text: page.via === 'page' ? `Found in the page, with this site's id.` : `Found in a script the page loads: ${page.via?.replace(/^https?:\/\//, '')}`,
      }
    if (page.found === 'other' || page.found === 'nosite') return { tone: 'warn', title: "This site's snippet", text: `trckable is on ${where}, but ${page.found === 'other' ? "with another site's id" : 'without any site id'}. Copy the code below again.` }
    return { tone: 'warn', title: "This site's snippet", text: `Not in the page or in the ${scripts} it loads. Add the code below to your homepage's <head>.` }
  }
  const visitsStep = (): Step => {
    if (pend.visits) return { tone: 'wait', title: 'Visits arriving', text: 'Asking for the latest visit…' }
    if (fresh) return { tone: 'ok', title: 'Visits arriving', text: `The last one ${seen}.` }
    return { tone: 'warn', title: 'No visits in the last day', text: `The last one was ${seen}.` }
  }
  const reach = reachStep()
  const snippet = snippetStep()
  const visits = visitsStep()
  const verified = !checking && snippet.tone === 'ok'
  const showCode = code ?? (!checking && !verified)
  const headText = () => {
    if (checking) return `Checking ${site.domain}…`
    if (verified) return fresh ? `Connected and verified` : `Snippet found, but no visits in the last day`
    // Say what was checked: the snippet, on the homepage.
    if (page?.found === 'other') return `Snippet seen, but it is another site's`
    if (page?.found === 'nosite') return `Snippet seen, but without a site id`
    return `Snippet not seen`
  }
  const subText = () => {
    if (checking) return 'This server fetches your homepage and up to 20 scripts it links to, looks for this site\'s id in them, then asks for the latest visit it recorded.'
    if (verified) return fresh ? `This site's snippet is on ${site.domain} and visits are arriving from it.` : 'The snippet is in place. Visits show up here within seconds of someone opening a page.'
    if (page?.error) return `${site.domain} could not be read, so the snippet could not be found. Until it can, the install is not verified.`
    return `This site's id is not on ${site.domain}'s homepage${fresh ? ', though visits did arrive — the snippet may be on some pages only' : ''}.`
  }
  const head = headText()
  const sub = subText()
  // The mark beside the heading: done, working on it, or needs a look.
  const markIcon = () => {
    if (verified) return <CircleCheck size={18} strokeWidth={1.75} />
    if (checking) return <Activity size={18} strokeWidth={1.75} />
    return <TriangleAlert size={18} strokeWidth={1.75} />
  }
  const markTone = () => {
    if (verified && fresh) return ' accent'
    return checking ? '' : ' warn'
  }

  return (
    <>
      <section className="card install-check" aria-busy={checking}>
        <div className="install-check-head">
          <span className={'icon-tile' + markTone()} aria-hidden="true">
            {markIcon()}
          </span>
          <div>
            <h3>{head}</h3>
            <p className="muted">{sub}</p>
            {at && !checking && (
              <span className="install-at faint" key={at.getTime()}>
                Checked at {clock(at, site.timezone)}
              </span>
            )}
          </div>
          <button type="button" className="btn" onClick={() => check(true)} disabled={checking}>
            {checking ? <span className="btn-spin" aria-hidden="true" /> : <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />}
            {checking ? 'Checking…' : 'Verify again'}
          </button>
        </div>
        <ul className="install-steps">
          {[reach, snippet, visits].map((s) => (
            <li key={s.title} className={'install-step ' + s.tone}>
              <span className="install-step-mark" aria-hidden="true" key={s.tone}>
                <StepMark tone={s.tone} />
              </span>
              <span>
                <b>{s.title}</b>
                <span className="faint">{s.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn ghost install-more" aria-expanded={showCode} onClick={() => setCode(!showCode)}>
        <ChevronRight size={15} strokeWidth={1.75} style={{ transform: showCode ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} aria-hidden="true" />
        {showCode ? 'Hide the code' : 'Show the code again'}
      </button>
      {showCode && <Install site={site} visits={[]} variant="settings" />}
    </>
  )
}

type Step = { tone: 'ok' | 'warn' | 'info' | 'wait'; title: string; text: string }

function StepMark({ tone }: { tone: Step['tone'] }) {
  if (tone === 'ok') return <Check size={14} strokeWidth={2.25} />
  if (tone === 'wait') return <span className="btn-spin" />
  if (tone === 'info') return <InfoIcon size={14} strokeWidth={2} />
  return <TriangleAlert size={14} strokeWidth={2} />
}

/** Whether a moment was within the last day. */
function withinDay(ts: number): boolean {
  return Date.now() - ts < 86_400_000
}

function agoText(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'a day ago' : `${d} days ago`
}
