// One connected payment provider: its status, and the menu of what can be done with the connection.
import { useState } from 'react'
import { Menu } from '../components/Menu'
import { type PayConnection, type Provider, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { navigate } from '../lib/url'
import { modeNote, modeTag, statusOf } from '../lib/payments'
import { useConfirm } from '../components/Confirm'
import { can } from '../lib/permissions'
import { settle, toast } from '../components/Toast'
import { ManualSetup } from './PaymentsManual'
import { ProviderMark } from './ProviderMark'

const RECALCULATE = 'Recalculate payments'

export function ConnectionRow({ site, c, provider, onChange }: { site: Site; c: PayConnection; provider?: Provider; onChange: () => void }) {
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
          {c.mode === 'test' && <span className="tag quiet" title={modeNote}>{modeTag(c.provider)}</span>}
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
                {(c.payments || 0) > 0 && (
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
          {can('payment.manage') && (
            <button
              type="button"
              role="menuitem"
              disabled={!!busy}
              onClick={async () => {
                close()
                const ok = await ask({
                  title: 'Recalculate payments?',
                  body: 'The saved payment notices of the last 30 days are read again with the current rules, so amounts, refunds and links come out as today’s version counts them. Nothing is sent to the provider.',
                  confirmLabel: 'Recalculate',
                  busyLabel: 'Recalculating…',
                  done: 'Payments recalculated',
                  run: () => more.reprocessPayments(site.id),
                })
                if (ok) onChange()
              }}
            >
              {RECALCULATE}
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
