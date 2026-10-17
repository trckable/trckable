// What a settings section shows when its first read failed: what could not be loaded, the reason in a few plain words, and a
// way to ask again. Never the reason alone ("Not found" with nothing to press).
import { errorCopy as t } from '../lib/errorCopy'

export function LoadFailed({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div className="banner" role="alert">
      <span>
        {t.loadFailed}
        {reason ? ` · ${reason}` : ''}
      </span>
      <button type="button" className="btn" onClick={onRetry}>
        {t.retry}
      </button>
    </div>
  )
}
