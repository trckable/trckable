import { lazy, Suspense, useState } from 'react'
import { Ghost } from './Logo'
import { openShortcuts } from './ShortcutsHost'

const FeedbackDialog = lazy(() => import('./FeedbackDialog'))
// The status looks at the server after the page is up, so it is a chunk of its own.
const ServerStatus = lazy(() => import('./ServerStatus'))

const CHANGELOG = 'https://trckable.com/docs/changelog/'
/** The foot of every dashboard page, one faint line: the ghost, how the server
    is doing, this instance's version (or the newer one), and where to read more. */
export function Footer({ version, newer, onNewer, site }: { version?: string; newer?: string; onNewer?: () => void; site?: string }) {
  const [feedback, setFeedback] = useState(false)
  return (
    <footer className="app-footer">
      <span className="app-footer-start">
        <a href="https://trckable.com" className="app-footer-ghost" aria-label="trckable">
          <Ghost size={16} />
        </a>
        <Suspense fallback={null}>
          <ServerStatus />
        </Suspense>
      </span>
      <span className="app-footer-links">
        {newer ? (
          <button type="button" className="footer-newer" onClick={onNewer}>
            v{newer} is out
          </button>
        ) : (
          version && <a href={CHANGELOG}>v{version}</a>
        )}
        <a href={CHANGELOG} className="footer-wide">
          Changelog
        </a>
        <a href="https://trckable.com/docs/" className="footer-wide">
          Docs
        </a>
        <button type="button" className="footer-wide" onClick={() => setFeedback(true)}>
          Feedback
        </button>
        <button type="button" aria-label="Keyboard shortcuts" onClick={openShortcuts}>
          ?
        </button>
      </span>
      {feedback && (
        <Suspense fallback={null}>
          <FeedbackDialog site={site} onClose={() => setFeedback(false)} />
        </Suspense>
      )}
    </footer>
  )
}
