// Shown until the first visit arrives: pick an install method, copy it, and
// watch the "waiting" state turn into a live confirmation.
import { Info } from '../components/Info'
import { useEffect, useState } from 'react'
import { CodeBlock } from '../components/Code'
import { Ghost } from '../components/Logo'
import { api, type Site, type Visit } from '../lib/api'
import { MethodIcon } from '../components/MethodIcon'
import { Picker } from '../components/Picker'
import { METHODS, type Ctx } from '../lib/install'

export function InstallPanel({ site, visits, always = false }: { site: Site; visits: Visit[]; always?: boolean }) {
  const [hasEvents, setHasEvents] = useState<boolean | null>(always ? false : null)
  useEffect(() => {
    if (always) return
    api
      .events(site.id, 1)
      .then((r) => setHasEvents(r.events.length > 0))
      .catch(() => setHasEvents(false))
  }, [site.id, always])
  if (hasEvents !== false) return null
  return <Install site={site} visits={visits} />
}

/** What almost everyone needs; the rest is one dropdown away. */
const COMMON = ['script', 'next', 'react']

export function Install({ site, visits, inSettings = false, bare = false }: { site: Site; visits: Visit[]; inSettings?: boolean; bare?: boolean }) {
  // The card on an empty dashboard keeps the three common ways; the full
  // catalogue (every builder, CMS and framework) lives in Settings → Install.
  // ?method=wordpress opens on that platform: the docs link straight to it.
  const [pick, setPick] = useState(() => {
    const wanted = new URLSearchParams(location.search).get('method')
    return METHODS.some((x) => x.id === wanted) ? wanted! : 'script'
  })
  // The proxy key is a credential, so the server sends it to owners only.
  // A viewer still sees the recipe, with the key named rather than spelled out.
  const ctx: Ctx = { host: location.origin, site: site.id, domain: site.domain, proxyKey: site.proxy_key || 'your-proxy-key' }
  const all = METHODS // every route is reachable from anywhere the card appears
  const m = all.find((x) => x.id === pick) ?? all[0]
  const first = visits[0]

  const Wrap = bare ? ('div' as const) : ('section' as const)
  return (
    <Wrap className={bare ? 'install-bare' : inSettings ? 'card' : 'card rise'} aria-label="Install trckable" style={{ gap: 14, borderColor: bare || inSettings ? undefined : 'var(--border-2)' }}>
      {!bare && (
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {!inSettings && <Ghost size={48} peek={!first} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: inSettings ? 15 : 18 }}>{first ? 'Peekaboo! Your first visit just arrived.' : inSettings ? `Install on ${site.domain}` : `Add trckable to ${site.domain}`}</h2>
          {first && !inSettings && (
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {`Someone opened ${first.path ?? '/'}${first.country ? ' from ' + first.country : ''}.`}
            </p>
          )}
        </div>
        {!inSettings && (
          <span className="chip" aria-live="polite">
            {first ? <span className="dot" style={{ background: 'var(--up)', borderRadius: '50%' }} /> : <span className="pulse" />}
            {first ? 'Receiving visits' : 'Waiting for the first visit…'}
          </span>
        )}
      </div>
      )}

      {/* Pictures, not a list of words: three tiles cover almost everyone and
          the rest is one dropdown away. Even columns, because a ragged row of
          four reads as a mistake. */}
      <div className="install-pick">
        {COMMON.map((id) => {
          const x = METHODS.find((y) => y.id === id)!
          return (
            <button key={id} type="button" className={m?.id === id ? 'mtile on' : 'mtile'} aria-pressed={m?.id === id} onClick={() => setPick(id)}>
              <MethodIcon id={id} />
              {x.name}
            </button>
          )
        })}
        {(
          <Picker
            label="Other ways to install"
            placeholder="Search WordPress, Shopify, Nginx…"
            value={COMMON.includes(m?.id ?? '') ? undefined : m?.id}
            onPick={setPick}
            items={METHODS.filter((x) => !COMMON.includes(x.id)).map((x) => ({ id: x.id, label: x.name, group: x.group, hint: x.keywords }))}
            trigger={(current) => (
              <span className={current ? 'mtile on' : 'mtile'}>
                <MethodIcon id={current?.id ?? 'script'} />
                {current?.label ?? 'Something else'}
              </span>
            )}
          />
        )}
      </div>

      {m && (
        <div key={m.id} className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CodeBlock code={m.code(ctx)} />
          <span className="faint" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {m.where}
            {m.note && <Info text={m.note} />}
          </span>
        </div>
      )}
    </Wrap>
  )
}

