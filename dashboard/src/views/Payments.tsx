// Settings → Payments. Connecting a provider is three taps: pick it, paste the
// key, done. Everything wordy (manual webhooks, checkout snippets) lives behind
// its own button, so the page itself stays short.
import { Banknote, Info, Link2, TriangleAlert } from 'lucide-react'
import { Menu } from '../components/Menu'
import { DialogActions } from '../components/DialogActions'
import { DialogHead } from '../components/DialogHead'
import { Modal } from '../kit/Modal'
import { useEffect, useState } from 'react'
import { fail, type PayConnection, type Provider, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { navigate } from '../lib/url'
import { modeTag, statusOf } from '../lib/payments'
import { CodeBlock } from '../components/Code'
import { Picker } from '../components/Picker'
import { confirmWith, useConfirm } from '../components/Confirm'
import { isViewer } from '../lib/me'
import { settle, toast } from '../components/Toast'
import { useConnectFirst } from './useConnectFirst'
import { Connect } from './PaymentsConnect'
import { PayPicker } from './PayPicker'
import { ManualSetup } from './PaymentsManual'
import { ProviderMark } from './ProviderMark'
import './Payments.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'INR', 'BRL', 'MXN', 'SGD', 'NZD', 'ZAR']

type Data = { connections: PayConnection[]; providers: Provider[]; webhook_base: string; key_error?: string }

export function PaymentsSettings({ site, onSiteChange }: { site: Site; onSiteChange: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [adding, setAdding] = useState<Provider | null>(null)
  const [snippets, setSnippets] = useState(false)
  const [setup, setSetup] = useState<PayConnection | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => {
    more
      .payments(site.id)
      .then(setData)
      .catch((e: unknown) => setErr(words(e)))
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 10_000) // "waiting for the first webhook" turns green by itself
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function each render but reads only site.id, which is listed
  }, [site.id])

  const byId = (id: string) => data?.providers.find((p) => p.id === id)
  const connected = data?.connections ?? []
  const recorded = connected.reduce((n, c) => n + c.payments, 0)
  const available = data?.providers.filter((p) => !connected.some((c) => c.provider === p.id)) ?? []
  useConnectFirst(available, setAdding)
  return (
    <section className="pay" id="payments">
      <div className="pay-head">
        <span className="icon-tile money" aria-hidden="true">
          <Banknote size={18} strokeWidth={1.75} />
        </span>
        <span className="pay-head-text">
          <h2>Payments</h2>
          <span className="faint">
            {connected.length === 0
              ? 'Connect a provider to see which traffic pays.'
              : `${connected.length} provider${connected.length === 1 ? '' : 's'} connected · ${recorded.toLocaleString()} payment${recorded === 1 ? '' : 's'} recorded`}
          </span>
        </span>
        <span className="pay-currency faint">
          Revenue in
          <Picker
            label="Currency"
            placeholder="Search a currency…"
            value={site.currency}
            onPick={(currency) =>
              more
                .updateSite(site.id, { name: site.name, currency })
                .then(() => {
                  toast(`Revenue is shown in ${currency}`)
                  onSiteChange()
                })
                .catch((e: unknown) => fail(e))
            }
            items={(CURRENCIES.includes(site.currency) ? CURRENCIES : [site.currency, ...CURRENCIES]).map((c) => ({ id: c, label: c }))}
          />
        </span>
      </div>

      {data?.key_error && (
        <div className="pay-alert bad" role="alert">
          <TriangleAlert size={17} strokeWidth={1.75} aria-hidden="true" />
          <span>
            <b>The saved provider keys cannot be read</b>
            <span>
              {data.key_error}. Webhooks answer 503, so providers keep retrying for a while (Stripe about three days). Start the server with the original TRCKABLE_SECRET, or its old data/secret.key,
              to pick up where it was. If that key is gone for good, start over with this server's key and reconnect each provider.
            </span>
            {!isViewer() && (
              <button
                type="button"
                className="btn danger pay-startover"
                onClick={async () => {
                  const pw = await confirmWith({
                    title: 'Start over with this server’s key?',
                    body: 'The provider keys and signing secrets saved with the old key are forgotten, and so is the Search Console key. Payments already recorded stay. Reconnect each provider afterwards. Looking someone up by email will not find payments recorded before today.',
                    field: { label: 'Your password', type: 'password', autoComplete: 'current-password' },
                    confirmLabel: 'Start over',
                    danger: true,
                    busyLabel: 'Starting over…',
                    done: 'Started over — reconnect each provider',
                    run: (mine) => more.startOverKeys(mine),
                  })
                  if (pw !== null) load()
                }}
              >
                Start over with this server’s key
              </button>
            )}
          </span>
        </div>
      )}
      {err && <div className="banner">{err}</div>}
      {data && /^http:\/\/|localhost|127\.0\.0\.1/.test(data.webhook_base) && (
        <div className="pay-alert info">
          <Info size={17} strokeWidth={1.75} aria-hidden="true" />
          <span>
            <b>Providers cannot reach this server yet</b>
            <span>Webhooks would go to {data.webhook_base}. Set TRCKABLE_BASE_URL to this server's public https address.</span>
          </span>
        </div>
      )}

      {connected.length > 0 && (
        <div className="pay-group">
          <span className="pay-group-head">Connected</span>
          {connected.map((c) => (
            <ConnectionRow key={c.id} site={site} c={c} provider={byId(c.provider)} onChange={load} />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="pay-group">
          <span className="pay-group-head">{connected.length ? 'Add another' : 'Connect a provider'}</span>
          <PayPicker available={available} onPick={setAdding} />
        </div>
      )}

      {connected.length > 0 && (
        <div className="pay-link">
          <span className="icon-tile" aria-hidden="true">
            <Link2 size={17} strokeWidth={1.75} />
          </span>
          <span className="pay-link-text">
            <b>Link sales to visits</b>
            <span className="faint">Pass the visitor id to checkout, so each payment is credited to the visit that brought it.</span>
          </span>
          <button type="button" className="btn" onClick={() => setSnippets(true)}>
            Show how
          </button>
        </div>
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
      {setup && <ManualSetup site={site} c={setup} provider={byId(setup.provider)} onClose={() => {
        setSetup(null)
        load()
      }} />}
      {snippets && <Attribution onClose={() => setSnippets(false)} />}
    </section>
  )
}

function ConnectionRow({ site, c, provider, onChange }: { site: Site; c: PayConnection; provider?: Provider; onChange: () => void }) {
  const { ask, dialog } = useConfirm()
  const [busy, setBusy] = useState('')
  const [msg] = useState('')
  const [manual, setManual] = useState(false)
  const status = statusOf(c)
  return (
    <div className={busy ? 'conn busy' : 'conn'} aria-busy={!!busy}>
      <ProviderMark id={c.provider} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>{provider?.name ?? c.provider}</strong>
          {c.mode === 'test' && <span className="tag quiet">{modeTag(c.provider)}</span>}
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
                more
                  .syncPayments(site.id, c.id)
                  .then((r) => settle(id, r.added ? `Found ${r.added} new event${r.added > 1 ? 's' : ''}` : 'Up to date — nothing was missed'))
                  .catch((e: unknown) => settle(id, words(e), 'error'))
                  .finally(() => {
                    setBusy('')
                    onChange()
                  })
              }}
            >
              {busy === 'sync' ? 'Checking…' : 'Check for missed payments'}
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => {
            close()
            setManual(true)
          }}>
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
                body: `Revenue already recorded stays${c.payments > 0 ? ` (${c.payments} payments)` : ''}. New payments stop arriving here.${c.managed ? ' The webhook trckable created is removed.' : ` Remove the webhook in ${provider?.name} too.`} You can reconnect at any time.`,
                confirmLabel: 'Disconnect',
                danger: true,
                busyLabel: 'Disconnecting…',
                done: `${provider?.name} disconnected · recorded revenue kept`,
                run: () => more.disconnectPayments(site.id, c.id),
              })
              if (ok) onChange()
            }}
          >
            Disconnect
          </button>
          </>
        )}
      </Menu>

      {manual && <ManualSetup site={site} c={c} provider={provider} onClose={() => {
        setManual(false)
        onChange()
      }} />}
      {dialog}
    </div>
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
      <DialogHead heading="Attribute each sale" hint="Pass the visitor id to your checkout." help="Renewals follow it automatically. Without it, revenue still counts in totals but shows as unattributed." />
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
