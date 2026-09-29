// One API key: name, its start in mono, when it was last used, Revoke.
import { KeyRound } from 'lucide-react'
import { confirm } from '../../components/Confirm'
import { api, type APIKey } from '../../lib/api'
import { ago } from './ago'
import { keys as t } from './keysCopy'

export function KeyRow({ k, onRevoked }: { k: APIKey; onRevoked: () => void }) {
  const revoke = async () => {
    const ok = await confirm({
      title: t.revokeTitle(k.name),
      body: k.last_used_at ? t.revokeUsed : t.revokeUnused,
      confirmLabel: t.revoke,
      danger: true,
      busyLabel: t.revoking,
      done: t.revoked,
      run: () => api.revokeKey(k.id),
    })
    if (ok) onRevoked()
  }
  return (
    <div className="person key-row">
      <span className="person-avatar" aria-hidden="true">
        <KeyRound size={17} strokeWidth={1.75} />
      </span>
      <span className="person-text">
        <span className="person-name">{k.name}</span>
        <code className="key-prefix">{k.prefix}…</code>
      </span>
      <span className="person-controls">
        <span className="key-used num">{t.lastUsed(k.last_used_at ? ago(k.last_used_at) : t.never)}</span>
        <button type="button" className="btn ghost danger" aria-label={t.revokeLabel(k.name)} onClick={revoke}>
          {t.revoke}
        </button>
      </span>
    </div>
  )
}
