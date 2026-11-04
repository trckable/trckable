// Settings → Payments. Connecting a provider is three taps: pick it, paste the
// key, done. Everything wordy (manual webhooks, checkout snippets) lives behind
// its own button, so the page itself stays short.
import { Banknote, Info, Link2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fail, type PayConnection, type Provider, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { refreshSetup } from '../v2/setup/memory'
import { visibleInterval } from '../lib/visibleInterval'
import { Picker } from '../components/Picker'
import { confirmWith } from '../components/Confirm'
import { can } from '../lib/permissions'
import { toast } from '../components/Toast'
import { useConnectFirst } from './useConnectFirst'
import { Attribution } from './PaymentsAttribution'
import { Connect } from './PaymentsConnect'
import { PayPicker } from './PayPicker'
import { ConnectionRow } from './PaymentsConnection'
import { ManualSetup } from './PaymentsManual'
import './Payments.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'INR', 'BRL', 'MXN', 'SGD', 'NZD', 'ZAR']

type Data = { connections: PayConnection[]; providers: Provider[]; webhook_base: string; key_error?: string }

export function PaymentsSettings({ site, onSiteChange }: { site: Site; onSiteChange: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [adding, setAdding] = useState<Provider | null>(null)
  const [snippets, setSnippets] = useState(false)
  const [setup, setSetup] = useState<PayConnection | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const linked = useRef<number | null>(null)
  const load = () => {
    more
      .payments(site.id)
      .then((d) => {
        setData(d)
        // A provider connected or removed changes what the Live card says: its checklist is read again.
        if (linked.current !== null && linked.current !== d.connections.length) refreshSetup(site.id)
        linked.current = d.connections.length
      })
      .catch((e: unknown) => setErr(words(e)))
  }
  useEffect(() => {
    load()
    return visibleInterval(load, 10_000) // "waiting for the first webhook" turns green by itself
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function each render but reads only site.id, which is listed
  }, [site.id])

  const byId = (id: string) => data?.providers.find((p) => p.id === id)
  const connected = data?.connections ?? []
  const recorded = connected.reduce((n, c) => n + (c.payments || 0), 0)
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
            {can('payment.manage') && (
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
