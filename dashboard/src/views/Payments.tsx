// Settings → Payments. Connecting a provider is three taps: pick it, paste the
// key, done. Everything wordy (manual webhooks, checkout snippets) lives behind
// its own button, so the page itself stays short.
import { Check } from 'lucide-react'
import { Menu } from '../components/Menu'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { Ghost } from '../components/Logo'
import { useEffect, useState } from 'react'
import { api, type PayConnection, type Provider, type Site } from '../lib/api'
import { navigate } from '../lib/url'
import { CodeBlock } from '../components/Code'
import { Picker } from '../components/Picker'
import { useConfirm } from '../components/Confirm'
import { settle, toast } from '../components/Toast'
import './Payments.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'INR', 'BRL', 'MXN', 'SGD', 'NZD', 'ZAR']

type Data = { connections: PayConnection[]; providers: Provider[]; webhook_base: string; key_error?: string }

export function PaymentsSettings({ site, onSiteChange }: { site: Site; onSiteChange: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [adding, setAdding] = useState<Provider | null>(null)
  const [snippets, setSnippets] = useState(false)
  const [setup, setSetup] = useState<PayConnection | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () =>
    api
      .payments(site.id)
      .then(setData)
      .catch((e: Error) => setErr(e.message))
  useEffect(() => {
    load()
    const t = setInterval(load, 10_000) // "waiting for the first webhook" turns green by itself
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  const byId = (id: string) => data?.providers.find((p) => p.id === id)
  const connected = data?.connections ?? []
  return (
    <section className="card" id="payments" style={{ gap: 14 }}>
      <div className="card-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="money-dot" /> Payments
        </h2>
        <span className="faint" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          Show revenue in
          <Picker
            label="Currency"
            align="right"
            placeholder="Search a currency…"
            value={site.currency}
            onPick={(currency) => api.updateSite(site.id, { name: site.name, currency }).then(onSiteChange)}
            items={(CURRENCIES.includes(site.currency) ? CURRENCIES : [site.currency, ...CURRENCIES]).map((c) => ({ id: c, label: c }))}
          />
        </span>
      </div>

      {data?.key_error && (
        <div className="banner" role="alert" style={{ borderColor: 'var(--down)', color: 'var(--down)' }}>
          {data.key_error}. Webhooks answer 503 so nothing is lost; restore the original TRCKABLE_SECRET to resume.
        </div>
      )}
      {err && <div className="banner">{err}</div>}
      {data && /^http:\/\/|localhost|127\.0\.0\.1/.test(data.webhook_base) && (
        <div className="banner">Providers can't reach {data.webhook_base}. Set TRCKABLE_BASE_URL to this server's public https address.</div>
      )}

      {connected.map((c) => (
        <ConnectionRow key={c.id} site={site} c={c} provider={byId(c.provider)} onChange={load} />
      ))}

      {connected.length === 0 && <p className="muted" style={{ margin: 0 }}>Connect a provider to see which traffic pays.</p>}

      <div className="prov-grid">
        {data?.providers
          .filter((p) => !connected.some((c) => c.provider === p.id))
          .map((p) => (
            <button key={p.id} type="button" className="prov" onClick={() => setAdding(p)}>
              <ProviderMark id={p.id} />
              <b>{p.name}</b>
              <span className="faint">Connect</span>
            </button>
          ))}
      </div>

      {connected.length > 0 && (
        <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setSnippets(true)}>
          Send visitor ids to checkout →
        </button>
      )}

      {adding && (
        <Connect
          site={site}
          provider={adding}
          onCancel={() => setAdding(null)}
          onDone={(c) => {
            setAdding(null)
            load()
            // A provider connected by API key is finished. Everything else
            // still needs the webhook, so open it rather than making them
            // find a button.
            if (!c.has_secret || c.provider === 'custom') setSetup(c)
          }}
        />
      )}
      {setup && <ManualSetup site={site} c={setup} provider={byId(setup.provider)} onClose={() => (setSetup(null), load())} />}
      {snippets && <Attribution onClose={() => setSnippets(false)} />}
    </section>
  )
}

/**
 * A mark per provider, drawn in trckable's own hand. Not their logo: shipping
 * someone else's trademark would mean bundling their assets and following
 * their brand rules, and a copy in the wrong colour is worse than a clean
 * shape of our own. The tint follows each brand, so they stay recognisable.
 */
const MARKS: Record<string, { tint: string; d: string }> = {
  // Stripe: the slanted S, as two strokes.
  stripe: { tint: '#635bff', d: 'M15 7.5c-1-.6-2.2-1-3.4-1-1.6 0-2.6.7-2.6 1.7 0 2.6 6.4 1.6 6.4 5.6 0 2-1.8 3.2-4.3 3.2-1.4 0-2.9-.4-4.1-1' },
  // Lemon Squeezy: a lemon.
  lemonsqueezy: { tint: '#ffc233', d: 'M7 15.5c2.4 2.4 7 2.6 9.4.2s2.2-7-.2-9.4c-1.6 1.6-3 1-5 1.4s-3.6 1.8-4 3.6.2 3 .2 3z' },
  // Polar: a circle with a bite of light, like the pole at midnight.
  polar: { tint: '#0062ff', d: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a4 4 0 1 1 0 8' },
  // Paddle: a paddle blade.
  paddle: { tint: '#ffd400', d: 'M12 3c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6Zm0 12v6' },
  // Dodo: a bird, in three strokes.
  dodo: { tint: '#f97316', d: 'M7 17c0-4 2.5-7 6-7 1.7 0 3 .8 3.7 1.8M16.7 11.8 20 9m-9 8h5M8 10.5h.01' },
  // Anything else, connected by webhook.
  custom: { tint: '#9ca3af', d: 'M4 12h4l2-5 4 10 2-5h4' },
}

function ProviderMark({ id }: { id: string }) {
  const m = MARKS[id] ?? MARKS.custom
  return (
    <span className="prov-mark" aria-hidden="true" style={{ background: `color-mix(in srgb, ${m.tint} 16%, transparent)`, color: m.tint }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={m.d} />
      </svg>
    </span>
  )
}

function ago(unix?: number) {
  if (!unix) return ''
  const s = Math.max(0, Math.round(Date.now() / 1000 - unix))
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

function ConnectionRow({ site, c, provider, onChange }: { site: Site; c: PayConnection; provider?: Provider; onChange: () => void }) {
  const { ask, dialog } = useConfirm()
  const [busy, setBusy] = useState('')
  const [msg] = useState('')
  const [manual, setManual] = useState(false)
  const live = c.last_event_at
  const status = !c.has_secret
    ? { tone: 'var(--money)', text: 'Needs its signing secret' }
    : live
      ? { tone: 'var(--up)', text: `Receiving payments · ${ago(live)}` }
      : c.payments > 0
        ? { tone: 'var(--up)', text: 'Payments recorded' }
        : c.last_test_event_at
          ? { tone: 'var(--up)', text: 'Test event received' }
          : { tone: 'var(--text-3)', text: 'Waiting for the first payment' }
  return (
    <div className={busy ? 'conn busy' : 'conn'} aria-busy={!!busy}>
      <ProviderMark id={c.provider} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>{provider?.name ?? c.provider}</strong>
          {c.mode === 'test' && <span className="tag quiet">test mode</span>}
        </div>
        <div className="conn-status">
          {busy ? (
            <>
              <span className="stage-mark" aria-hidden="true" style={{ width: 13, height: 13, borderColor: 'var(--accent)', borderRightColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              <span className="muted">{busy === 'disconnect' ? 'Disconnecting…' : 'Checking…'}</span>
            </>
          ) : (
            <>
              <span className="dot" style={{ background: status.tone, borderRadius: '50%' }} />
              <span className="muted conn-text">
                {status.text}
                {c.payments > 0 && (
                  <span className="faint num">
                    {' '}
                    · {c.payments.toLocaleString()} payment{c.payments === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
        {c.last_error && <div style={{ color: 'var(--down)', fontSize: 12.5, marginTop: 3 }}>{c.last_error}</div>}
        {msg && <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>{msg}</div>}
      </div>

      {(!c.has_secret || (c.provider === 'custom' && c.payments === 0)) && (
        <button type="button" className="btn primary" onClick={() => setManual(true)}>
          {c.provider === 'custom' ? 'URL and secret' : 'Finish setup'}
        </button>
      )}
      <Menu label={`${provider?.name} options`}>
        {(close) => (
          <>
          {c.managed && (
            <button
              type="button"
              role="menuitem"
              disabled={!!busy}
              onClick={() => {
                close()
                setBusy('sync')
                const id = toast(`Checking ${provider?.name} for missed payments…`, 'busy')
                api
                  .syncPayments(site.id, c.id)
                  .then((r) => settle(id, r.added ? `Found ${r.added} new event${r.added > 1 ? 's' : ''}` : 'Up to date — nothing was missed'))
                  .catch((e: Error) => settle(id, e.message, 'error'))
                  .finally(() => (setBusy(''), onChange()))
              }}
            >
              {busy === 'sync' ? 'Checking…' : 'Check for missed payments'}
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => (close(), setManual(true))}>
            Webhook &amp; signing secret
          </button>
          {(c.last_test_event_at || c.mode === 'test') && (
            <button type="button" role="menuitem" onClick={() => navigate('/' + encodeURIComponent(site.domain) + '?payments=test')}>
              View test revenue
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            style={{ color: 'var(--down)' }}
            onClick={async () => {
              close()
              const ok = await ask({
                title: `Disconnect ${provider?.name}?`,
                body: `Revenue already recorded stays${c.payments > 0 ? ` (${c.payments} payments)` : ''}. New payments stop arriving, the webhook trckable created is removed, and later sales will show as unattributed. You can reconnect at any time.`,
                confirmLabel: 'Disconnect',
                danger: true,
                busyLabel: 'Disconnecting…',
                done: `${provider?.name} disconnected · recorded revenue kept`,
                run: () => api.disconnectPayments(site.id, c.id),
              })
              if (ok) onChange()
            }}
          >
            Disconnect
          </button>
          </>
        )}
      </Menu>

      {manual && <ManualSetup site={site} c={c} provider={provider} onClose={() => (setManual(false), onChange())} />}
      {dialog}
    </div>
  )
}

/** The snippet that reports a sale, in our own format. Node here because it is
 *  the shortest; the same four lines exist in every language. */
function ownSnippet(url: string, secret: string | null): string {
  return `import { createHmac } from 'node:crypto'

const body = JSON.stringify({
  id: 'evt_' + order.id, // your id: a resend is not a second sale
  type: 'payment',
  at: new Date().toISOString(),
  payment: {
    id: order.id,
    amount: 4900,        // minor units, tax included
    tax: 800,            // optional
    currency: 'EUR',
    kind: 'one_time',    // or subscription / renewal
    email: order.email,  // optional, stored hashed
    visitor: vid,        // optional, links the sale to the visit
  },
})
const ts = Math.floor(Date.now() / 1000)
await fetch('${url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Trckable-Timestamp': String(ts),
    'Trckable-Signature': 'v1=' + createHmac('sha256', ${secret ? `'${secret}'` : 'SECRET'}).update(ts + '.' + body).digest('hex'),
  },
  body,
})`
}

/** The manual webhook, one step at a time instead of three stacked boxes. */
function ManualSetup({ site, c, provider, onClose }: { site: Site; c: PayConnection; provider?: Provider; onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [secret, setSecret] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const [done, setDone] = useState(c.has_secret)
  const [err, setErr] = useState<string | null>(null)
  const ls = c.provider === 'lemonsqueezy'
  const own = c.provider === 'custom' // our own format: there is no provider to configure
  const steps = own ? ['Where to send', 'How to sign', 'First sale'] : ['Endpoint', 'Events', 'Secret']

  return (
    <Modal label={`${provider?.name} webhook`} className="wizard" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ProviderMark id={c.provider} />
        <h2>{provider?.name} webhook</h2>
      </div>
      <div className="wiz-rail" aria-hidden="true">
        {steps.map((label, i) => (
          <span key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
            <i />
            {label}
          </span>
        ))}
      </div>

      <div key={step} className="wiz-step">
        {step === 1 && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {own ? 'Post every sale to this URL, from your server. It is only ever called by code you write.' : `In ${provider?.name}, add a webhook endpoint with this URL.`}
            </p>
            <CodeBlock code={c.webhook_url} lang="url" />
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Later
              </button>
              <button type="button" className="btn primary big" onClick={() => setStep(2)}>
                {own ? 'Next' : 'Added it'}
              </button>
            </div>
          </>
        )}

        {step === 2 &&
          (own ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Sign the body with your secret, so nobody else can invent a sale. Amounts are in minor units — cents, not euros.
              </p>
              {shown ? <CodeBlock code={shown} lang="secret" /> : (
                <button type="button" className="btn" onClick={() => api.paymentSecret(site.id, c.id).then((r) => setShown(r.secret))}>
                  Show the secret
                </button>
              )}
              <CodeBlock code={ownSnippet(c.webhook_url, shown)} lang="js" />
              <span className="faint" style={{ fontSize: 12 }}>
                type is payment, refund or dispute. visitor comes from getIds() in trckable/server, or the trckable_vid you put on the checkout.
              </span>
              <div className="wiz-actions">
                <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="btn primary big" onClick={() => setStep(3)}>
                  Next
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Subscribe that endpoint to these events.
              </p>
              <CodeBlock code={(provider?.events ?? []).join('\n')} lang="events" />
              <div className="wiz-actions">
                <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="btn primary big" onClick={() => setStep(3)}>
                  Subscribed
                </button>
              </div>
            </>
          ))}

        {step === 3 && (
          <>
            {/* A generated secret means nothing is left to paste, so this
                provider is waiting on a sale rather than on setup. */}
            {own ? (
              <div className="wiz-done">
                <Ghost size={40} peek />
                <b>Waiting for your first sale.</b>
                <span className="muted">Send one and it appears here within a minute. Send the same id twice and it is still one sale.</span>
              </div>
            ) : done ? (
              <div className="wiz-done">
                <Check size={34} strokeWidth={2} aria-hidden="true" />
                <b>Connected.</b>
                <span className="muted">Payments will appear as they happen.</span>
              </div>
            ) : ls ? (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Lemon Squeezy asks you for a signing secret. Use this one.
                </p>
                {shown ? <CodeBlock code={shown} lang="secret" /> : (
                  <button type="button" className="btn primary big" onClick={() => api.paymentSecret(site.id, c.id).then((r) => (setShown(r.secret), setDone(true)))}>
                    Show the secret
                  </button>
                )}
              </>
            ) : (
              <form
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  api
                    .setPaymentSecret(site.id, c.id, secret)
                    .then(() => (setSecret(''), setDone(true), setErr(null)))
                    .catch((e: Error) => setErr(e.message))
                }}
              >
                <p className="muted" style={{ margin: 0 }}>
                  Paste the signing secret {provider?.name} showed for that endpoint.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="input num" style={{ flex: 1, minWidth: 200, height: 48 }} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="whsec_…" autoComplete="off" autoFocus />
                  <button type="submit" className="btn primary big" disabled={!secret}>
                    Save
                  </button>
                </div>
                {err && (
                  <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
                    {err}
                  </span>
                )}
              </form>
            )}
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className={done ? 'btn primary' : 'btn'} onClick={onClose}>
                {done ? 'Done' : 'Close'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function Connect({ site, provider, onCancel, onDone }: { site: Site; provider: Provider; onCancel: () => void; onDone: (c: PayConnection) => void }) {
  const [key, setKey] = useState('')
  const [mode, setMode] = useState<'live' | 'test'>('live')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = (manual: boolean) => {
    setBusy(true)
    setErr(null)
    const id = toast(manual ? `Adding ${provider.name}…` : `Connecting ${provider.name} and creating the webhook…`, 'busy')
    api
      .connectPayments(site.id, { provider: provider.id, mode, api_key: manual ? undefined : key.trim() })
      .then((c) => {
        settle(id, manual ? `${provider.name} added — finish the webhook setup` : `${provider.name} connected · revenue is on`)
        onDone(c)
      })
      .catch((e: Error) => (setErr(e.message), settle(id, e.message, 'error')))
      .finally(() => setBusy(false))
  }
  // Nothing to connect to: trckable hands out a secret and waits to be told.
  if (provider.id === 'custom')
    return (
      <Modal label="Connect anything" className="wide" onClose={onCancel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProviderMark id={provider.id} />
          <h2>Anything else</h2>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          There is no account to connect. trckable gives you a URL and a signing secret, and your own code posts each sale to it — whatever
          took the money.
        </p>
        {err && (
          <div role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {err}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn primary big" disabled={busy} onClick={() => submit(true)}>
            {busy ? 'Setting up…' : 'Give me the URL and secret'}
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal label={`Connect ${provider.name}`} className="wide" onClose={onCancel}>
      <form className="modal-form" onSubmit={(e) => (e.preventDefault(), submit(false))}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProviderMark id={provider.id} />
          <h2>Connect {provider.name}</h2>
        </div>

        {provider.has_modes && (
          <div className="seg" role="group" aria-label="Mode" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>
              Live
            </button>
            <button type="button" aria-pressed={mode === 'test'} onClick={() => setMode('test')}>
              {provider.id === 'polar' ? 'Sandbox' : 'Test'}
            </button>
          </div>
        )}

        <input className="input num" style={{ height: 50, fontSize: 15 }} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder={provider.key_hint} aria-label="API key" />
        <span className="faint" style={{ fontSize: 12 }}>
          <a href={provider.key_url} target="_blank" rel="noreferrer noopener">
            Where to find it →
          </a>{' '}
          Stored encrypted. Used to create the webhook and to check for missed payments.
        </span>

        {err && (
          <div role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {err}
          </div>
        )}

        <button type="submit" className="btn primary big" disabled={busy || !key.trim()}>
          {busy ? 'Connecting…' : 'Connect ' + provider.name}
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => submit(true)}>
            I'll add the webhook myself
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

const snippets: Record<string, string> = {
  'Payment links': `<!-- Nothing to do: the trckable script adds the visitor to
     Stripe Payment Links, Lemon Squeezy, Polar and Dodo checkout links on click. -->
<a href="https://buy.stripe.com/…">Buy</a>`,
  Stripe: `import { getIds, checkoutFields } from 'trckable/server'

const ids = getIds(request.headers.get('cookie'))
await stripe.checkout.sessions.create({
  ...params,
  ...checkoutFields('stripe', ids, 'subscription'), // or 'payment'
})`,
  'Lemon Squeezy': `const ids = getIds(request.headers.get('cookie'))
await createCheckout(storeId, variantId, {
  checkoutData: checkoutFields('lemonsqueezy', ids).checkout_data,
})`,
  Polar: `const ids = getIds(request.headers.get('cookie'))
await polar.checkouts.create({ products: [productId], ...checkoutFields('polar', ids) })`,
  Paddle: `// Paddle.js, in the browser: read the trckable_vid cookie
Paddle.Checkout.open({
  items,
  customData: { trckable_vid: document.cookie.match(/trckable_vid=([^;]+)/)?.[1] },
})`,
  Dodo: `const ids = getIds(request.headers.get('cookie'))
await dodo.checkoutSessions.create({ ...params, ...checkoutFields('dodo', ids) })`,
}

/** Which mark goes with which snippet tab. */
const SNIP_FOR: Record<string, string> = {
  'Payment links': 'custom',
  Stripe: 'stripe',
  'Lemon Squeezy': 'lemonsqueezy',
  Polar: 'polar',
  Paddle: 'paddle',
  Dodo: 'dodo',
}

function Attribution({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState('Payment links')
  return (
    <Modal label="Attribute each sale" className="wide" onClose={onClose}>
      <h2>Attribute each sale to its visit</h2>
      <p className="muted" style={{ margin: 0 }}>
        Pass the visitor id to your checkout. Renewals follow it automatically. Without it, revenue still counts in totals but shows as unattributed.
      </p>
      <div className="prov-tabs" role="tablist" aria-label="Checkout">
        {Object.entries(SNIP_FOR).map(([label, id]) => (
          <button key={label} type="button" role="tab" aria-selected={tab === label} className={tab === label ? 'mtile on' : 'mtile'} onClick={() => setTab(label)}>
            <ProviderMark id={id} />
            {label}
          </button>
        ))}
      </div>
      <CodeBlock code={snippets[tab]} lang="text" />
      <DialogActions>
        <button type="button" className="btn primary big" onClick={onClose}>
          Done
        </button>
      </DialogActions>
    </Modal>
  )
}
