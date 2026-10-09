// The manual webhook for a provider, one step at a time: the URL, the secret,
// the events to tick. Opened from Payments.tsx.
import { Check } from 'lucide-react'
import { Modal } from '../kit/Modal'
import { StepBody } from '../components/StepBody'
import { Steps } from '../components/Steps'
import { Ghost } from '../components/Logo'
import { useState } from 'react'
import { fail, type PayConnection, type Provider, type Site, more } from '../lib/apiMore'
import { CodeBlock } from '../components/Code'
import { ProviderMark } from './ProviderMark'

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

const GUMROAD = {
  show: 'Show the ping URL',
  back: 'Back',
  next: 'Next',
  refunds: (events: string[]) =>
    `A Ping URL reports sales only. To count refunds and disputes too, remove this and connect Gumroad with an access token (Settings → Advanced → Applications, scope view_sales): trckable then subscribes to ${events.join(', ')} itself.`,
}

const STEPS: Record<string, string[]> = {
  custom: ['Where to send', 'How to sign', 'First sale'],
  gumroad: ['Ping URL', 'Refunds', 'First sale'],
}

function stepNames(provider: string) {
  return STEPS[provider] ?? ['Endpoint', 'Events', 'Secret']
}

const INTRO: Record<string, string> = {
  custom: 'Post every sale to this URL, from your server.',
  gumroad: 'In Gumroad, open Settings → Advanced and paste this as the Ping URL. It holds a secret: keep it private.',
}

function introFor(provider: string, name = '') {
  return INTRO[provider] ?? `In ${name}, add a webhook endpoint with this URL.`
}

/** The manual webhook, one step at a time instead of three stacked boxes. */
export function ManualSetup({ site, c, provider, onClose }: { site: Site; c: PayConnection; provider?: Provider; onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [secret, setSecret] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const [done, setDone] = useState(c.has_secret)
  const ls = c.provider === 'lemonsqueezy'
  const own = c.provider === 'custom' // our own format: there is no provider to configure
  const gr = c.provider === 'gumroad' // unsigned pings: the secret rides in the URL
  const pp = c.provider === 'paypal' // the secret is the webhook ID PayPal shows
  const waiting = own || gr // nothing to paste back: the connection waits for a sale
  const steps = stepNames(c.provider)
  const intro = introFor(c.provider, provider?.name)

  return (
    <Modal label={`${provider?.name} webhook`} className="wizard" onClose={onClose}>
      <div className="dlg-head">
        <ProviderMark id={c.provider} />
        <h2>{provider?.name} webhook</h2>
      </div>
      <Steps labels={steps} at={step - 1} />

      <StepBody step={step}>
        {step === 1 && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {intro}
            </p>
            {gr && !shown ? (
              <button type="button" className="btn" onClick={() => more.paymentSecret(site.id, c.id).then((r) => setShown(r.secret))}>
                {GUMROAD.show}
              </button>
            ) : (
              <CodeBlock code={gr ? `${c.webhook_url}?token=${shown}` : c.webhook_url} lang="url" />
            )}
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Later
              </button>
              <button type="button" className="btn primary big" disabled={gr && !shown} onClick={() => setStep(2)}>
                {own ? 'Next' : 'Added it'}
              </button>
            </div>
          </>
        )}

        {step === 2 && gr && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {GUMROAD.refunds(provider?.events ?? [])}
            </p>
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn primary big" onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 &&
          !gr &&
          (own ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Sign the body with your secret. Amounts are in cents, not euros.
              </p>
              {shown ? <CodeBlock code={shown} lang="secret" /> : (
                <button type="button" className="btn" onClick={() => more.paymentSecret(site.id, c.id).then((r) => setShown(r.secret))}>
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
            {waiting && (
              <div className="wiz-done">
                <Ghost size={40} peek />
                <b>Waiting for your first sale.</b>
                <span className="muted">Send one and it appears within a minute. The same id twice is one sale.</span>
              </div>
            )}
            {!waiting && done && (
              <div className="wiz-done">
                <Check size={34} strokeWidth={2} aria-hidden="true" />
                <b>Connected.</b>
                <span className="muted">Payments will appear as they happen.</span>
              </div>
            )}
            {!waiting && !done && ls && (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Lemon Squeezy asks you for a signing secret. Use this one.
                </p>
                {shown ? <CodeBlock code={shown} lang="secret" /> : (
                  <button type="button" className="btn primary big" onClick={() => more.paymentSecret(site.id, c.id).then((r) => {
                    setShown(r.secret)
                    setDone(true)
                  })}>
                    Show the secret
                  </button>
                )}
              </>
            )}
            {!waiting && !done && !ls && (
              <form
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  more
                    .setPaymentSecret(site.id, c.id, secret)
                    .then(() => {
                      setSecret('')
                      setDone(true)
                    })
                    .catch((e: unknown) => fail(e))
                }}
              >
                <p className="muted" style={{ margin: 0 }}>
                  {pp ? 'Paste the Webhook ID PayPal shows for that webhook.' : `Paste the signing secret ${provider?.name} shows for that endpoint.`}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="input num" style={{ flex: 1, minWidth: 200, height: 48 }} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={pp ? 'Webhook ID' : 'whsec_…'} autoComplete="off" autoFocus />
                  <button type="submit" className="btn primary big" disabled={!secret}>
                    Save
                  </button>
                </div>
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
      </StepBody>
    </Modal>
  )
}
