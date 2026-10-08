// Connecting a provider: paste a restricted key, or take the URL and secret
// of the "anything else" webhook. A key the provider refuses is said under
// its field; trouble that is not the key's fault is a toast.
import { useState } from 'react'
import { DialogActions } from '../components/DialogActions'
import { Field } from '../components/Field'
import { Modal } from '../kit/Modal'
import { refused, type PayConnection, type Provider, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { keyPicksMode, testModeName } from '../lib/payments'
import { settle, toast } from '../components/Toast'
import { connectCopy } from './connectCopy'
import { ProviderMark } from './ProviderMark'

export function Connect({ site, provider, onCancel, onDone }: { site: Site; provider: Provider; onCancel: () => void; onDone: (c: PayConnection) => void }) {
  const [key, setKey] = useState('')
  const [mode, setMode] = useState<'live' | 'test'>('live')
  const [busy, setBusy] = useState(false)
  const [keyErr, setKeyErr] = useState<string | null>(null)
  const submit = (manual: boolean) => {
    setBusy(true)
    setKeyErr(null)
    const id = toast(manual ? `Adding ${provider.name}…` : `Connecting ${provider.name} and creating the webhook…`, 'busy')
    more
      .connectPayments(site.id, { provider: provider.id, mode, api_key: manual ? undefined : key.trim() })
      .then((c) => {
        settle(id, manual ? `${provider.name} added — finish the webhook setup` : `${provider.name} connected · revenue is on`)
        onDone(c)
      })
      .catch((e: unknown) => {
        // A refused key stays at its field; anything else (offline, busy) is the toast.
        if (!manual && refused(e)) {
          settle(id, connectCopy.notConnected(provider.name), 'error')
          setKeyErr(connectCopy.refused(provider.name))
        } else settle(id, words(e), 'error')
      })
      .finally(() => setBusy(false))
  }
  // Nothing to connect to: trckable hands out a secret and waits to be told.
  if (provider.id === 'custom')
    return (
      <Modal label="Connect anything" className="wide" onClose={onCancel}>
        <div className="dlg-head">
          <ProviderMark id={provider.id} />
          <div className="dlg-head-text">
            <h2>Anything else</h2>
            <span className="faint">Your own code posts each sale to a URL.</span>
          </div>
        </div>
        <DialogActions left={<button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}>
          <button type="button" className="btn primary big" disabled={busy} onClick={() => submit(true)}>
            {busy ? 'Setting up…' : 'Give me the URL and secret'}
          </button>
        </DialogActions>
      </Modal>
    )

  return (
    <Modal label={`Connect ${provider.name}`} className="wide" onClose={onCancel}>
      <form className="modal-form" onSubmit={(e) => {
        e.preventDefault()
        submit(false)
      }}>
        <div className="dlg-head">
          <ProviderMark id={provider.id} />
          <div className="dlg-head-text">
            <h2>Connect {provider.name}</h2>
            <span className="faint">Paste a restricted API key.</span>
          </div>
        </div>

        {provider.has_modes && !keyPicksMode(provider.id, key) && (
          <div className="seg" role="group" aria-label="Mode" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>
              Live
            </button>
            <button type="button" aria-pressed={mode === 'test'} onClick={() => setMode('test')}>
              {testModeName(provider.id)}
            </button>
          </div>
        )}

        <Field label="API key" plain help="Stored encrypted. Used to create the webhook and to check for missed payments." error={keyErr}>
          {(f) => <input {...f} className="input num" value={key} onChange={(e) => { setKey(e.target.value); setKeyErr(null) }} autoComplete="off" spellCheck={false} placeholder={provider.key_hint} aria-label="API key" />}
        </Field>
        <a className="key-link" href={provider.key_url} target="_blank" rel="noreferrer noopener">
          Where to find it →
        </a>

        <DialogActions
          left={
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => submit(true)}>
                I'll add the webhook myself
              </button>
              <button type="button" className="btn ghost" onClick={onCancel}>
                Cancel
              </button>
            </>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !key.trim()}>
            {busy ? 'Connecting…' : 'Connect ' + provider.name}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
