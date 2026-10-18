// A site before its first visit, in the walkthrough's own words: it is ready and listening, here is the one line to paste,
// and the check. Every other way in (a platform, a prompt for an editor, history to import, the weekly email) is under it.
// The first visit swaps this page for the Briefing by itself, the moment the stream brings it.
import { lazy, Suspense, useState } from 'react'
import type { InstallCheck, Site, Visit } from '../../lib/api'
import { METHODS, type Ctx } from '../../lib/install'
import { can } from '../../lib/permissions'
import { aiPrompt, copy as inst, waitCard } from '../../features/install/copy'
import { first as firstCopy } from '../../features/install/firstCopy'
import { outcomeOf } from '../../features/install/outcome'
import { methodOf, stepsFor, tagFor } from '../../features/install/snippet'
import { useSeen } from '../../features/install/seen'
import { useCookieless } from '../../features/install/useCookieless'
import { useInstallCheck, type CheckState } from '../../features/install/useInstallCheck'
import { useWeeklyEmail } from '../../features/install/useWeeklyEmail'
import { dayWords } from '../dayWords'
import { navigate } from '../../lib/url'
import { todayIn } from '../../lib/dates'
import { copy } from './copy'
import { copy as v2 } from '../copy'

const ImportDialog = lazy(() => import('../../features/install/ImportDialog').then((m) => ({ default: m.ImportDialog })))

const clock = (tz: string): string => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date())

/** One block of code with its own copy button. */
function Code({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="fresh-code">
      <code className="mono snip">{text}</code>
      <button
        type="button"
        className="xb"
        onClick={() => {
          void navigator.clipboard?.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        }}
      >
        {done ? copy.freshCopied : label}
      </button>
    </div>
  )
}

function Other({ site, ctx, visits }: { site: Site; ctx: Ctx; visits: Visit[] }) {
  const [id, setId] = useState('script')
  const [prompt, setPrompt] = useState(false)
  const method = methodOf(id)
  const groups = [...new Set(METHODS.map((m) => m.group))]
  const owner = can('setup.run')
  const [importSeen, putImportAway] = useSeen('import', site.id)
  const [importing, setImporting] = useState(false)
  const weekly = useWeeklyEmail(site, owner)
  const [weeklySeen, putWeeklyAway] = useSeen('weekly', site.id)
  const showWeekly = owner && weekly.ready && !weekly.on && !weeklySeen && !importing
  return (
    <details className="mk-card fresh-other">
      <summary>{copy.freshOther}</summary>
      <div className="fresh-body">
        <label className="fresh-pick">
          <span>{copy.freshPlatform}</span>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {METHODS.filter((m) => m.group === g).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="mk-quiet">{method.where}</p>
        {stepsFor(method, ctx).map((s) => (
          <div key={s.title || 'one'}>
            {s.title && <p className="fresh-step">{s.title}</p>}
            <Code text={s.code} label={copy.freshCopy} />
          </div>
        ))}
        <div className="xrow2">
          <button
            type="button"
            className="xb"
            onClick={() => {
              void navigator.clipboard?.writeText(aiPrompt(ctx, method))
              setPrompt(true)
              setTimeout(() => setPrompt(false), 1600)
            }}
          >
            {prompt ? waitCard.promptCopied : waitCard.prompt}
          </button>
        </div>
        {owner && !importSeen && (
          <div className="fresh-row">
            <span>
              <b>{firstCopy.cards.import.label}</b> · {firstCopy.cards.import.body}
            </span>
            <button
              type="button"
              className="xb"
              onClick={() => {
                putImportAway()
                setImporting(true)
              }}
            >
              {firstCopy.cards.import.go}
            </button>
          </div>
        )}
        {showWeekly && (
          <div className="fresh-row">
            <span>
              <b>{firstCopy.cards.weekly.label}</b> · {firstCopy.cards.weekly.body}
            </span>
            <button type="button" className="xb" disabled={weekly.busy} onClick={() => weekly.toggle(putWeeklyAway)}>
              {firstCopy.cards.weekly.go}
            </button>
          </div>
        )}
        <p className="mk-quiet">{visits.length === 0 ? waitCard.foot : ''}</p>
      </div>
      {importing && (
        <Suspense fallback={null}>
          <ImportDialog domain={site.domain} site={site.id} onClose={() => setImporting(false)} />
        </Suspense>
      )}
    </details>
  )
}

/** What the check last found, while it runs or when it is done. */
function foundOf(s: CheckState): InstallCheck | undefined {
  if (s.phase === 'done') return s.result
  return s.phase === 'checking' ? s.last : undefined
}

export default function Fresh({ site, visits }: { site: Site; visits: Visit[] }) {
  const cookieless = useCookieless(site.id)
  const check = useInstallCheck(site.id, visits.length > 0)
  const [copied, setCopied] = useState(false)
  const ctx: Ctx = { host: location.origin, site: site.id, domain: site.domain, proxyKey: site.proxy_key || 'your-proxy-key', cookieless: cookieless.on === true }
  const snippet = tagFor(ctx)
  const found = foundOf(check.state)
  const out = found ? outcomeOf(found, site.domain) : null
  const day = dayWords(todayIn(site.timezone))
  const [since] = useState(() => clock(site.timezone))
  const name = site.name || site.domain
  return (
    <div className="mk mk-body mk-fresh">
      <div className="brief">
        <section className="mk-card hero" aria-label={copy.freshLabel}>
          <div className="htop">
            <div className="hl-col">
              <a
                className="gh fresh-back"
                href="/sites"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/sites')
                }}
              >
                {waitCard.back}
              </a>
              <span className="tline">
                {v2.today} · {day}
              </span>
              <span className="since">
                <span className="mk-pulse" />
                {copy.freshListening}
              </span>
              <h1 className="mk-hl">
                <b>{copy.freshReady(name)}</b> {copy.freshWaiting}
              </h1>
              <h1 className="mk-hl s">
                <em>{copy.freshReady(name)}</em> {copy.freshWaiting}
              </h1>
              <p className="hsub keep">{copy.freshSub}</p>
            </div>
            <div className="sidecol setup">
              <code className="mono snip">{snippet}</code>
              <div className="xrow2">
                <button
                  type="button"
                  className="xb p"
                  onClick={() => {
                    void navigator.clipboard?.writeText(snippet)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  }}
                >
                  {copied ? copy.freshCopied : copy.freshCopyLine}
                </button>
                <button type="button" className="xb" disabled={check.state.phase === 'checking'} onClick={check.start}>
                  {copy.freshCheck}
                </button>
              </div>
              <div className="fresh-found" aria-live="polite">
                {check.state.phase === 'checking' && !found && inst.checking(site.domain)}
                {out && out.text}
                {check.state.phase === 'limited' && inst.limited}
                {check.state.phase === 'failed' && inst.failed}
              </div>
            </div>
          </div>
          <div className="facts fz">
            <div className="fact">
              <b>{0}</b>
              <small>{copy.freshPeople}</small>
              <span className="m">{copy.freshNothing}</span>
            </div>
            <div className="fact">
              <b>{since}</b>
              <small>{copy.freshSince}</small>
              <span className="m">{copy.freshEvery}</span>
            </div>
          </div>
        </section>
        <Other site={site} ctx={ctx} visits={visits} />
      </div>
    </div>
  )
}
