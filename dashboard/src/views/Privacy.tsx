// Settings → Data & privacy. Everything here is part of trckable, not an
// add-on: the defaults record the most, and each switch is the owner deciding
// to record less. Nothing is paywalled, and nothing is on without them.
import { useEffect, useState } from 'react'
import { Switch } from '../components/Switch'
import { api, type BannerText, type ContentGroup, type PersonFound, type PersonPayment, type Site, type SiteConfig } from '../lib/api'
import { Info } from '../components/Info'
import { Picker } from '../components/Picker'
import { toast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { Shares } from './Shares'
import { CodeBlock } from '../components/Code'
import { policyCaveats, policyText } from '../lib/policy'
import { Row } from '../components/Row'
import { DialogActions } from '../components/DialogActions'
import { BarPreview } from '../components/BarPreview'
import { setSettingsTab, settingsParam } from '../lib/settings'
import './Privacy.css'

const KEEP = [
  { id: '0', label: 'Keep everything' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '180', label: '6 months' },
  { id: '365', label: '1 year' },
  { id: '730', label: '2 years' },
  { id: '1095', label: '3 years' },
]

export function PrivacySettings({ site }: { site: Site }) {
  const [c, setC] = useState<SiteConfig | null>(null)
  const [mods, setMods] = useState<Record<string, boolean> | null>(null)
  const [paths, setPaths] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api
      .siteConfig(site.id)
      .then((r) => {
        setC(r)
        setPaths((r.exclude_paths ?? []).join('\n'))
      })
      .catch((e: Error) => setErr(e.message))
  }, [site.id])

  // Which modules are on decides what this site records, so both the banner
  // card and the policy paragraph need it — once, not twice.
  useEffect(() => {
    api
      .modules(site.id)
      .then((r) => setMods(Object.fromEntries(r.modules.map((m) => [m.id, m.enabled]))))
      .catch(() => setMods({}))
  }, [site.id])

  const save = (patch: Partial<SiteConfig>, said?: string) => {
    if (!c) return
    const next = { ...c, ...patch }
    setC(next)
    api
      .setSiteConfig(site.id, next)
      .then((r) => {
        setC(r)
        toast(said ?? 'Saved')
      })
      .catch((e: Error) => toast(e.message, 'error'))
  }

  if (err) return <div className="banner">{err}</div>
  if (!c) return <div className="skeleton" style={{ height: 240 }} />

  const free = c.consent_free

  return (
    <>
      {/* The mode a European site can run without a cookie banner. It is a
          switch, not a checklist, because half of it would not be compliant. */}
      <section className={free ? 'card eu on' : 'card eu'} style={{ gap: 12 }}>
        <div className="card-head">
          <h2>
            <span className="eu-stars" aria-hidden="true">
              ★
            </span>
            Cookieless mode
          </h2>
          {free && <span className="tag live">on</span>}
          <button
            type="button"
            role="switch"
            aria-checked={free}
            aria-label="Cookieless mode"
            className={free ? 'switch on' : 'switch'}
            style={{ marginLeft: 'auto' }}
            onClick={() => save({ consent_free: !free }, free ? 'Cookieless mode is off' : 'Cookieless mode is on — the script stores nothing')}
          >
            <span />
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Nothing is stored in a visitor's browser: no cookie, no localStorage. Each visitor is counted by a hash of their IP address and browser that changes every day, and the IP itself is never stored. In
          countries with an analytics exemption (France, Italy, the Netherlands, Spain, the UK) that can let you skip the banner; Germany and Austria generally still ask for consent. Check your own rules.
        </p>
        <div className="eu-cols">
          <ul className="bullets good">
            <li>The script stores no cookie and nothing in localStorage</li>
            <li>Visitors are a salted hash that rotates daily; the IP is never stored</li>
            <li>The country stays; the city is dropped</li>
            <li>Do Not Track and Global Privacy Control are honoured</li>
            <li>Enforced by this server, so a cached script cannot opt back in</li>
          </ul>
          <ul className="bullets gone">
            <li>New versus returning is only right within a day</li>
            <li>Revenue is attributed to visits from the same day</li>
            <li>Sessions end at midnight in your timezone</li>
          </ul>
        </div>
        {free && <span className="faint" style={{ fontSize: 12 }}>Visitors get the smaller, storage-free script within the hour.</span>}
      </section>

      {!free && <Consent site={site} config={c} on={!!mods?.consent} onSave={save} />}

      <section className="card" style={{ gap: 0 }}>
        <div className="card-head" style={{ paddingBottom: 10 }}>
          <h2>What is recorded</h2>
          <Info text="trckable never stores an IP address, never loads anything from another company, and never sells or shares your data. These switches are about recording less than that floor, not more." />
        </div>

        <Row label="City" hint={free ? 'Cookieless mode keeps the country only' : 'The country is always recorded; the city is yours to choose'}>
          <Switch on={c.record_city} disabled={free} onChange={() => save({ record_city: !c.record_city }, c.record_city ? 'City is no longer recorded' : 'City will be recorded')} />
        </Row>

        <Row label="Honour Do Not Track and Global Privacy Control" hint={free ? 'Always on in cookieless mode' : 'Visits from browsers sending those signals are dropped before anything is stored'}>
          <Switch on={c.honor_dnt} disabled={free} onChange={() => save({ honor_dnt: !c.honor_dnt }, c.honor_dnt ? 'DNT and GPC are ignored again' : 'DNT and GPC will be honoured')} />
        </Row>

        <Row label="Stricter bot filtering" hint="Also drops clients that name no browser, and visits from data centres such as AWS or Hetzner (downloaded once, about 5 MB). Private Relay and VPN users still count">
          <Switch on={c.bot_strict} onChange={() => save({ bot_strict: !c.bot_strict })} />
        </Row>

        <Row label="Excluded paths" hint="One per line. /admin/* skips everything under it. Never recorded, so nothing to delete later.">
          <textarea
            className="input"
            style={{ minHeight: 76, width: 260, padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 12.5 }}
            value={paths}
            placeholder={'/admin/*\n/preview'}
            onChange={(e) => setPaths(e.target.value)}
            onBlur={() => {
              const list = paths
                .split('\n')
                .map((p) => p.trim())
                .filter(Boolean)
              if (list.join('\n') !== (c.exclude_paths ?? []).join('\n')) save({ exclude_paths: list }, list.length ? `${list.length} path${list.length > 1 ? 's' : ''} excluded` : 'Nothing is excluded now')
            }}
          />
        </Row>
      </section>

      <section className="card" style={{ gap: 0 }}>
        <div className="card-head" style={{ paddingBottom: 10 }}>
          <h2>How long it is kept</h2>
        </div>
        <Row label="Keep visits for" hint="Older visits are deleted daily. Nothing else is touched.">
          <Picker
            label="Retention"
            align="right"
            value={String(c.retention_days)}
            onPick={(v) => save({ retention_days: Number(v) }, v === '0' ? 'Visits are kept indefinitely' : `Visits older than ${v} days will be deleted`)}
            items={KEEP}
          />
        </Row>
        <Row label="Week starts on" hint="Used by weekly reports">
          <div className="seg" role="group" aria-label="Week starts on">
            <button type="button" aria-pressed={c.week_start === 1} onClick={() => save({ week_start: 1 })}>
              Monday
            </button>
            <button type="button" aria-pressed={c.week_start === 0} onClick={() => save({ week_start: 0 })}>
              Sunday
            </button>
          </div>
        </Row>
      </section>

      <PrivacyPolicy site={site} config={c} modules={mods} />
      <ContentGroups site={site} config={c} onSave={save} />
      <Shares site={site} />
      <DataRequest site={site} />
    </>
  )
}

/** trckable's own cookie bar: four strings and a preview of what a visitor
 *  will actually see. Saved on a button, never on a keystroke — this is text
 *  people read, and half a sentence is not a setting. */
const EMPTY_BAR: BannerText = { mode: '', text: '', accept: '', decline: '', policy: '', bg: '', fg: '', button: '', button_fg: '', position: '', radius: 0, css: '' }

// Two starting points, so nobody has to pick four colours to get something
// that looks deliberate. Everything stays editable afterwards.
const BAR_THEMES: { id: string; name: string; c: Pick<BannerText, 'bg' | 'fg' | 'button' | 'button_fg'> }[] = [
  { id: 'dark', name: 'Dark', c: { bg: '#15161a', fg: '#f3f4f6', button: '#f3f4f6', button_fg: '#15161a' } },
  { id: 'light', name: 'Light', c: { bg: '#ffffff', fg: '#15161a', button: '#15161a', button_fg: '#ffffff' } },
]

const BAR_PLACES = [
  { id: '', label: 'Bottom right' },
  { id: 'bl', label: 'Bottom left' },
  { id: 'wide', label: 'Full width' },
]

/** One card for one decision: keep the cookie and ask first. How you ask —
 *  by reading the consent manager the site already runs, or with a bar of
 *  trckable's own — is a setting inside it, not a second module. */
function Consent({ config, on, onSave }: { site: Site; config: SiteConfig; on: boolean; onSave: (patch: Partial<SiteConfig>, said?: string) => void }) {
  const saved = { ...EMPTY_BAR, ...(config.banner ?? {}) }
  const [b, setB] = useState(saved)
  const [css, setCSS] = useState(false)
  const key = JSON.stringify(saved)
  useEffect(() => setB(JSON.parse(key)), [key])
  const dirty = key !== JSON.stringify(b)
  const bar = b.mode === 'bar'

  const field = (k: 'text' | 'accept' | 'decline' | 'policy') => ({
    value: b[k] ?? '',
    onChange: (e: { target: { value: string } }) => setB({ ...b, [k]: e.target.value.slice(0, 200) }),
  })
  const colour = (k: 'bg' | 'fg' | 'button' | 'button_fg', fallback: string) => ({
    value: b[k] || fallback,
    onChange: (e: { target: { value: string } }) => setB({ ...b, [k]: e.target.value }),
  })
  // The preview reads the real bar's own custom properties, so it cannot
  // drift from what a visitor sees.
  const look: Record<string, string> = {}
  if (b.bg) look['--tkb-bg'] = b.bg
  if (b.fg) look['--tkb-fg'] = b.fg
  if (b.button) look['--tkb-button'] = b.button
  if (b.button_fg) look['--tkb-button-fg'] = b.button_fg
  if (b.radius) look['--tkb-round'] = b.radius + 'px'
  if (b.position === 'wide') look['--tkb-width'] = 'none'

  if (!on) {
    return (
      <section className="card" id="consent" style={{ gap: 12 }}>
        <div className="card-head">
          <h2>Cookie consent</h2>
          <Info text="For sites that want the cookie and the returning-visitor numbers that come with it, and are willing to ask first. Cookieless mode above is the other answer: no cookie, and nothing stored on the device. A visitor who declines your banner is never counted, and the first page waits for their answer." />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Keep the cookie and ask first. trckable can read the consent manager you already run, or ask with a small bar of its own — about its one cookie and nothing else. Turn on the
          Cookie consent module to choose.
        </p>
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setSettingsTab('modules')}>
          Open Modules
        </button>
      </section>
    )
  }

  return (
    <section className="card" id="consent" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>Cookie consent</h2>
        <span className="tag live">on</span>
        <Info text="Until a visitor answers, the script stores nothing and their visit still counts. A browser already sending Do Not Track is never asked." />
      </div>

      <Row
        label="How you ask"
        hint={bar ? "trckable's bar covers trckable's cookie and nothing else — embedded video, chat or ads still need a manager of their own" : 'Google Consent Mode v2 and IAB TCF v2.2, read from the page'}
      >
        <div className="seg" role="group" aria-label="How you ask for consent">
          <button type="button" aria-pressed={!bar} onClick={() => setB({ ...b, mode: '' })}>
            Read my banner
          </button>
          <button type="button" aria-pressed={bar} onClick={() => setB({ ...b, mode: 'bar' })}>
            trckable's bar
          </button>
        </div>
      </Row>

      {!bar ? (
        <>
          <ul className="bullets good" style={{ margin: 0 }}>
            <li>Google Consent Mode v2 — the answer your manager or gtag writes to the dataLayer</li>
            <li>IAB TCF v2.2 — purposes 1 and 8, read through __tcfapi</li>
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            A banner that speaks neither — Cookiebot, Usercentrics, CookieYes, Osano, Complianz and most one-file banners can all do this — tells trckable directly. It costs no extra bytes:
          </p>
          <CodeBlock code={"// when the visitor accepts statistics\ntrckable('consent', true)\n\n// when they refuse, or change their mind\ntrckable('consent', false)"} lang="js" />
        </>
      ) : (
        <>
          <div className={b.position === 'bl' ? 'bar-preview left' : b.position === 'wide' ? 'bar-preview wide' : 'bar-preview'} style={look as React.CSSProperties}>
            <BarPreview
              text={b.text || 'We count visits with one cookie. Nothing else, and nothing shared.'}
              accept={b.accept || 'Accept'}
              decline={b.decline || 'Decline'}
              policy={b.policy}
              css={b.css}
            />
          </div>

          <Row label="What it says" hint="Leave any field empty to keep the English default">
            <input className="input" style={{ width: 300 }} aria-label="What the cookie bar says" placeholder="We count visits with one cookie. Nothing else, and nothing shared." {...field('text')} />
          </Row>
          <Row label="Agree button">
            <input className="input" style={{ width: 300 }} aria-label="The agree button's words" placeholder="Accept" {...field('accept')} />
          </Row>
          <Row label="Refuse button" hint="Refusing is one click, the same size as agreeing — keep both words short">
            <input className="input" style={{ width: 300 }} aria-label="The refuse button's words" placeholder="Decline" {...field('decline')} />
          </Row>
          <Row label="Link to your privacy policy" hint="Shown beside the sentence. A path like /privacy, or a full address">
            <input className="input" style={{ width: 300 }} aria-label="Link to your privacy policy" placeholder="/privacy" {...field('policy')} />
          </Row>

          <Row label="Colours" hint="Start from one of these, then change any of them">
            <div className="bar-colours">
              <div className="seg" role="group" aria-label="Colour theme">
                {BAR_THEMES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={b.bg === t.c.bg && b.fg === t.c.fg} onClick={() => setB({ ...b, ...t.c })}>
                    {t.name}
                  </button>
                ))}
              </div>
              <label className="swatch">
                <input type="color" aria-label="Background" {...colour('bg', '#15161a')} />
                <span>Background</span>
              </label>
              <label className="swatch">
                <input type="color" aria-label="Text" {...colour('fg', '#f3f4f6')} />
                <span>Text</span>
              </label>
              <label className="swatch">
                <input type="color" aria-label="Agree button" {...colour('button', '#f3f4f6')} />
                <span>Button</span>
              </label>
              <label className="swatch">
                <input type="color" aria-label="Agree button text" {...colour('button_fg', '#15161a')} />
                <span>Button text</span>
              </label>
            </div>
          </Row>

          <Row label="Where it sits">
            <div className="seg" role="group" aria-label="Where the bar sits">
              {BAR_PLACES.map((pl) => (
                <button key={pl.id} type="button" aria-pressed={(b.position || '') === pl.id} onClick={() => setB({ ...b, position: pl.id as BannerText['position'] })}>
                  {pl.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Corners" hint="0 to 40 px">
            <input
              className="input num"
              type="number"
              aria-label="Corner radius, in pixels"
              min={0}
              max={40}
              style={{ width: 90 }}
              value={b.radius || 12}
              onChange={(e) => setB({ ...b, radius: Math.max(0, Math.min(40, Number(e.target.value) || 0)) })}
            />
          </Row>

          <Row
            label="Your own CSS"
            hint="For anything the controls above cannot do. It is added inside the bar's shadow root, last, so it wins — and the page's own stylesheet still cannot reach in."
          >
            <button type="button" className="btn" onClick={() => setCSS(!css)}>
              {css ? 'Hide' : b.css ? 'Edit' : 'Write CSS'}
            </button>
          </Row>
          {css && (
            <>
              <textarea
                className="input"
                aria-label="Your own CSS for the cookie bar"
                spellCheck={false}
                style={{ minHeight: 120, width: '100%', padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12.5 }}
                placeholder={"div{border:1px solid #0002;font-family:Inter,sans-serif}\nbutton{border-radius:999px}\nbutton.no{box-shadow:none;text-decoration:underline}"}
                value={b.css ?? ''}
                onChange={(e) => setB({ ...b, css: e.target.value.slice(0, 4000) })}
              />
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                The bar is <code>div</code>, the sentence is <code>p</code>, the policy link is <code>a</code>, the two buttons are <code>button</code> and <code>button.no</code>. Its own
                settings are custom properties on <code>:host</code>: <code>--tkb-bg</code>, <code>--tkb-fg</code>, <code>--tkb-button</code>, <code>--tkb-button-fg</code>,{' '}
                <code>--tkb-round</code>, <code>--tkb-at</code>, <code>--tkb-width</code>, <code>--tkb-font</code>, <code>--tkb-shadow</code>.
              </p>
            </>
          )}
        </>
      )}

      <DialogActions
        left={
          dirty ? (
            <button type="button" className="btn ghost" onClick={() => setB(JSON.parse(key))}>
              Undo
            </button>
          ) : (
            <span className="faint" style={{ fontSize: 12 }}>Visitors see a change within the hour.</span>
          )
        }
      >
        <button type="button" className="btn primary" disabled={!dirty} onClick={() => onSave({ banner: b }, 'Saved — visitors see it within the hour')}>
          Save
        </button>
      </DialogActions>
    </section>
  )
}

/** The paragraph this site needs in its privacy policy, written from what it
 *  is actually set to collect. A generic one is wrong the moment a module is
 *  turned off; this one is read from the settings, so it stays true. */
function PrivacyPolicy({ site, config, modules }: { site: Site; config: SiteConfig; modules: Record<string, boolean> | null }) {
  const [open, setOpen] = useState(false)

  if (!modules) return <div className="skeleton" style={{ height: 120 }} />
  const input = { domain: site.domain, host: location.host, config, modules }
  const text = policyText(input)
  const caveats = policyCaveats(input)

  return (
    <section className="card" id="policy" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>Your privacy policy</h2>
        <Info text="Written from this site's own settings, not from a template: turn a module off or switch on cookieless mode and the paragraph changes with it. It is a starting point drafted by people who are not your lawyers — read it before you publish it." />
        <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show the paragraph'}
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        A paragraph you can paste into your policy, describing what trckable records on {site.domain} — as it is configured right now.
      </p>

      {open && (
        <>
          <CodeBlock code={text} lang="markdown" wrap />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Paragraph copied'))}>
              Copy it
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const blob = new Blob([text], { type: 'text/markdown' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `${site.domain}-analytics-privacy.md`
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              Download
            </button>
          </div>
          {caveats.length > 0 && (
            <div className="policy-notes">
              <b>Before you publish it</b>
              <ul>
                {caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Sections: /blog/* is "Writing". A site with four hundred URLs is read by
 *  the handful of parts it actually has. The rules are applied when a report
 *  runs, so changing them re-reads history rather than only what comes next. */
function ContentGroups({ site, config, onSave }: { site: Site; config: SiteConfig; onSave: (patch: Partial<SiteConfig>, said?: string) => void }) {
  const write = (gs: ContentGroup[]) => gs.map((g) => `${g.name} = ${g.path}`).join('\n')
  const [text, setText] = useState(() => write(config.groups ?? []))

  const parse = (s: string): ContentGroup[] =>
    s
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf('=')
        if (i < 0) return { name: line, path: line }
        return { name: line.slice(0, i).trim(), path: line.slice(i + 1).trim() }
      })
      .filter((g) => g.path.startsWith('/'))

  return (
    <section className="card" id="groups" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Sections</h2>
        <Info text="Group pages so a site is read by its parts and not by every URL. One rule per line, as Name = /path, and the first rule that matches wins — so put the narrow ones first. A trailing * matches everything under a path." />
      </div>
      <Row label="Rules" hint="Name = /path, one per line. First match wins.">
        <textarea
          className="input"
          style={{ minHeight: 96, width: 260, padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 12.5 }}
          value={text}
          placeholder={'Writing = /blog/*\nDocs = /docs/*\nPricing = /pricing'}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const gs = parse(text)
            if (write(gs) !== write(config.groups ?? [])) onSave({ groups: gs }, gs.length ? `${gs.length} section${gs.length > 1 ? 's' : ''}` : 'No sections — pages are shown one by one')
          }}
        />
      </Row>
      {site.domain && (config.groups ?? []).length > 0 && (
        <span className="faint" style={{ fontSize: 12, paddingTop: 10 }}>
          They appear as a Sections card in Full mode, and you can filter by one like any other row.
        </span>
      )}
    </section>
  )
}

/** Someone asks what you hold about them, or asks for it to go. Both start by
 *  finding the right person and showing what was found — an erasure that acts
 *  on a guess is worse than no erasure at all. */
function DataRequest({ site }: { site: Site }) {
  const { ask, dialog } = useConfirm()
  const [by, setBy] = useState<'visitor' | 'email'>('visitor')
  // A journey can send someone here with the visitor already in hand.
  const [value, setValue] = useState(() => settingsParam('visitor') ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [found, setFound] = useState<{ found: PersonFound; payments: PersonPayment[] } | null>(null)

  const look = (who = value, how = by) => {
    setBusy(true)
    setErr(null)
    setFound(null)
    api
      .findPerson(site.id, how, who.trim())
      .then(setFound)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  // Arriving from a visitor's journey: the lookup is why they came.
  useEffect(() => {
    const from = settingsParam('visitor')
    if (from) look(from, 'visitor')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  const erase = async () => {
    if (!found) return
    const ok = await ask({
      title: `Erase everything for ${found.found.visitor}?`,
      body:
        `${found.found.events} events and ${found.found.sessions} visits are deleted and cannot be brought back. ` +
        (found.payments.length ? 'Their payments stay as business records, with nothing on them pointing at a person any more; the payment provider\'s notices about them are deleted.' : ''),
      confirmLabel: 'Erase',
      danger: true,
      busyLabel: 'Erasing…',
      run: () => api.erasePerson(site.id, by, value.trim()).then((r) => toast(`Erased ${r.events} events and ${r.sessions} visits`)),
    })
    if (ok) (setFound(null), setValue(''))
  }

  const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

  return (
    <section className="card" id="requests" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>Answer a data request</h2>
        <Info text="Someone has the right to ask what you hold about them and to ask for it to go. trckable keeps no IP address and no name, so a request is answered by visitor id — or by the email used at checkout, which is the one thing that connects a person to a visit." />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        trckable stores no IP addresses and no names: a visitor is a number from a salted hash. Find them here, hand over the file, or erase them.
      </p>

      <div className="request-find">
        <div className="seg" role="group" aria-label="Find them by">
          <button type="button" aria-pressed={by === 'visitor'} onClick={() => (setBy('visitor'), setFound(null), setErr(null))}>
            Visitor id
          </button>
          <button type="button" aria-pressed={by === 'email'} onClick={() => (setBy('email'), setFound(null), setErr(null))}>
            Email
          </button>
        </div>
        <input
          className="input"
          value={value}
          placeholder={by === 'visitor' ? 'k3f9zq1' : 'them@company.com'}
          onChange={(e) => (setValue(e.target.value), setFound(null))}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && look()}
        />
        <button type="button" className="btn" disabled={busy || !value.trim()} onClick={() => look()}>
          {busy ? 'Looking…' : 'Look up'}
        </button>
      </div>
      {err && (
        <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
          {err}
        </span>
      )}

      {found && (
        <div className="request-found">
          <div className="request-facts">
            <span>
              <b className="num">{found.found.events}</b>
              events
            </span>
            <span>
              <b className="num">{found.found.sessions}</b>
              visits
            </span>
            <span>
              <b className="num">{found.payments.length}</b>
              payments
            </span>
            <span>
              <b>{when(found.found.first_seen)}</b>
              first seen
            </span>
            <span>
              <b>{when(found.found.last_seen)}</b>
              last seen
            </span>
            {found.found.countries?.length ? (
              <span>
                <b>{found.found.countries.join(', ')}</b>
                seen from
              </span>
            ) : null}
          </div>
          {found.found.events === 0 && found.payments.length === 0 ? (
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>Nothing is held for this visitor. There is nothing to export or erase.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn primary" href={api.exportPersonURL(site.id, by, value.trim())} download>
                Download their data
              </a>
              <button type="button" className="btn danger" onClick={erase}>
                Erase them
              </button>
            </div>
          )}
        </div>
      )}
      {dialog}
    </section>
  )
}
