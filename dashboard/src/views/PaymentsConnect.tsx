// Connecting a provider: paste a restricted key, or take the URL and secret
// of the "anything else" webhook. A key the provider refuses is said under
// its field; trouble that is not the key's fault is a toast.
import { useState } from 'react'
import { Field } from '../components/Field'
import { Modal } from '../kit/Modal'
import { Segmented } from '../kit/Segmented'
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
      <Modal
        label="Connect anything"
        onClose={onCancel}
        frame={{
          title: 'Anything else',
          subtitle: 'Your own code posts each sale to a URL.',
          icon: <ProviderMark id={provider.id} />,
          size: 'md',
          busy,
          actions: (
            <button type="button" className="btn primary big" disabled={busy} onClick={() => submit(true)}>
              {busy ? 'Setting up…' : 'Give me the URL and secret'}
            </button>
          ),
        }}
      />
    )

  return (
    <Modal
      label={`Connect ${provider.name}`}
      onClose={onCancel}
      frame={{
        title: `Connect ${provider.name}`,
        subtitle: 'Paste a restricted API key.',
        icon: <ProviderMark id={provider.id} />,
        size: 'md',
        busy,
        onSubmit: () => submit(false),
        extra: (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => submit(true)}>
            {connectCopy.manual}
          </button>
        ),
        actions: (
          <button type="submit" className="btn primary big" disabled={busy || !key.trim()}>
            {busy ? 'Connecting…' : 'Connect ' + provider.name}
          </button>
        ),
      }}
    >
      {provider.has_modes && !keyPicksMode(provider.id, key) && (
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'test', label: testModeName(provider.id) },
          ]}
        />
      )}

      <Field label="API key" plain help="Stored encrypted. Used to create the webhook and to check for missed payments." error={keyErr}>
        {(f) => <input {...f} className="input num" value={key} onChange={(e) => { setKey(e.target.value); setKeyErr(null) }} autoComplete="off" spellCheck={false} placeholder="Paste your API key" aria-label="API key" />}
      </Field>
      <p className="faint key-hint">
        {connectCopy.looksLike} <code>{provider.key_hint}</code>.{' '}
        <a className="key-link" href={provider.key_url} target="_blank" rel="noreferrer noopener">
          {connectCopy.whereToFind}
        </a>
      </p>
    </Modal>
  )
}
