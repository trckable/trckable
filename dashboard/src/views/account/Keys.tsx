// The account window's API keys tab (views/Account).
import { Eye, KeyRound } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { StepBody } from '../../components/StepBody'
import { Steps } from '../../components/Steps'
import { useEffect, useState } from 'react'
import { api, messageOf, type APIKey } from '../../lib/api'
import { toast } from '../../components/Toast'
import { useConfirm } from '../../components/Confirm'
import { Menu } from '../../components/Menu'

export function Keys() {
  const { ask, dialog } = useConfirm()
  const [keys, setKeys] = useState<APIKey[] | null>(null)
  const [creating, setCreating] = useState(false)
  const load = () => api.keys().then((r) => setKeys(r.keys ?? []))
  useEffect(() => {
    void load()
  }, [])

  const MAX = 20
  const used = keys?.length ?? 0
  const when = (unix?: number) => (unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null)

  return (
    <section className="people" id="keys">
      <div className="people-head">
        <span className="people-head-text">
          <h2>API keys</h2>
          <span className="faint">
            <span className="num">
              {used} of {MAX}
            </span>{' '}
            in use
          </span>
        </span>
        <button type="button" className="btn primary" disabled={used >= MAX} onClick={() => setCreating(true)}>
          <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
          New key
        </button>
        <span className="keys-bar" aria-hidden="true">
          <span style={{ width: `${(used / MAX) * 100}%` }} />
        </span>
        <div className="people-roles">
          <span>
            <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>
              A key <b>only reads</b>: it can never change a setting, a site or a payment.
            </span>
          </span>
          <span>
            <KeyRound size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>One per tool (Claude, Cursor, a script), so revoking one leaves the rest.</span>
          </span>
        </div>
      </div>

      <div className="people-list">
        {keys?.map((k) => (
          <div key={k.id} className="person keyrow">
            <span className="person-avatar" aria-hidden="true">
              <KeyRound size={17} strokeWidth={1.75} />
            </span>
            <span className="person-text">
              <span className="person-name">{k.name}</span>
              <span className="person-seen num">
                {k.prefix}… · created {when(k.created_at)}
              </span>
            </span>
            <span className="person-tags">
              <span className={'tag ' + (k.last_used_at ? 'on' : 'quiet')}>{k.last_used_at ? `Used ${when(k.last_used_at)}` : 'Never used'}</span>
            </span>
            <Menu label={`${k.name} options`}>
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      void navigator.clipboard?.writeText(k.prefix)
                      toast('Prefix copied — the full key is shown only once')
                    }}
                  >
                    Copy prefix
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    style={{ color: 'var(--down)' }}
                    onClick={async () => {
                      close()
                      const ok = await ask({
                        title: `Revoke "${k.name}"?`,
                        body: k.last_used_at
                          ? 'Anything using this key stops working immediately, and this cannot be undone.'
                          : 'This key has never been used. Revoking it cannot be undone.',
                        confirmLabel: 'Revoke',
                        danger: true,
                        busyLabel: 'Revoking…',
                        done: 'Key revoked',
                        run: () => api.revokeKey(k.id),
                      })
                      if (ok) void load()
                    }}
                  >
                    Revoke
                  </button>
                </>
              )}
            </Menu>
          </div>
        ))}
        {keys?.length === 0 && <span className="faint keys-empty">No keys yet. Create one for your AI assistant or a script.</span>}
        {!keys && <div className="skeleton" style={{ height: 54 }} />}
      </div>

      {creating && <NewKey onClose={() => setCreating(false)} onCreated={load} />}
      {dialog}
    </section>
  )
}

/** Creating a key is two steps: what it is for, then copy it — once. */
function NewKey({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const SUGGEST = ['Claude', 'Cursor', 'A script of mine', 'My AI assistant']

  const create = () => {
    setBusy(true)
    setErr(null)
    api
      .createKey(name.trim() || 'API key')
      .then((r) => {
        setSecret(r.secret)
        onCreated()
      })
      .catch((e: unknown) => setErr(messageOf(e)))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label="New API key" className="wizard" onClose={secret ? undefined : onClose}>
      <Steps labels={['What for', 'Copy it']} at={secret ? 1 : 0} />

      <StepBody step={secret ? 'key' : 'name'}>
        {!secret ? (
          <>
            <h2>What is this key for?</h2>
            <p className="muted" style={{ margin: 0 }}>
              A name you will recognise later. Each tool should have its own, so you can revoke one without breaking the others.
            </p>
            <input
              className="input"
              style={{ height: 48, fontSize: 15 }}
              value={name}
              maxLength={80}
              placeholder="Claude on my laptop"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SUGGEST.map((sg) => (
                <button key={sg} type="button" className="preset" onClick={() => setName(sg)}>
                  {sg}
                </button>
              ))}
            </div>
            {err && (
              <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
                {err}
              </span>
            )}
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary big" disabled={busy} onClick={create}>
                {busy ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Copy it now</h2>
            <p className="muted" style={{ margin: 0 }}>
              This is the only time the key is shown — trckable keeps just a hash of it.
            </p>
            <div className="keybox">
              <code>{secret}</code>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  navigator.clipboard?.writeText(secret).then(() => {
                    setCopied(true)
                    toast('Key copied')
                    setTimeout(() => setCopied(false), 1500)
                  })
                }
              >
                {copied ? 'Copied' : 'Copy key'}
              </button>
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              Paste it into your assistant's MCP config as TRCKABLE_API_KEY, or send it as an Authorization: Bearer header.
            </span>
            <div className="wiz-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </StepBody>
    </Modal>
  )
}
