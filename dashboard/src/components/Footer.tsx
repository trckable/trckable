import { BookOpen, MessageSquare } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import type { Site } from '../lib/api'
import { canAsk } from '../lib/me'
import { pageLoading } from '../lib/pageLoading'
import { caps, keyFor, useKeymap } from '../lib/keys'
import { openShortcuts } from './ShortcutsHost'
import { footerCopy as t } from './footerCopy'
import { CHANGELOG, DOCS, SOCIALS } from './footerLinks'
import { SocialIcon } from './SocialIcon'
import './Footer.css'

const FeedbackDialog = lazy(() => import('./FeedbackDialog'))
// The status looks at the server after the page is up, so it is a chunk of its own.
const statusChunk = () => import('./ServerStatus')
const ServerStatus = lazy(statusChunk)

/** How long the page has to settle before the foot is drawn: it sits under everything, so it would move with each part that arrives. */
const SETTLE = 1200
/** A page that is still loading after this long gets its foot anyway. */
const WAIT_MAX = 20_000

/** A page that offers Ask marks itself (components/Ask.tsx); the key is only hinted at where there is something behind it. */
const marked = (on: () => void) => {
  const watch = new MutationObserver(on)
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ask-about'] })
  return () => watch.disconnect()
}
const askOffered = () => document.documentElement.hasAttribute('data-ask-about')

function Key({ id, label, onClick }: { id: string; label: string; onClick?: () => void }) {
  const cap = caps(keyFor(id)).join('')
  const inner = (
    <>
      <kbd>{cap}</kbd>
      {label}
    </>
  )
  return onClick ? (
    <button type="button" className="footer-key" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <span className="footer-key">{inner}</span>
  )
}

/** The foot of every dashboard page: how things are, the keys that help, this version and where to read more. */
export function Footer({ version, newer, onNewer, site, sites }: { version?: string; newer?: string; onNewer?: () => void; site?: string; sites: Site[] }) {
  const [feedback, setFeedback] = useState(false)
  // Held back (still taking its room) until the status has arrived and the page has had a moment: a foot that fills in and
  // slides down as the page loads is a layout shift on every screen.
  const [ready, setReady] = useState(false)
  const [tired, setTired] = useState(false)
  const loading = pageLoading.use() > 0
  useEffect(() => {
    let live = true
    void Promise.all([statusChunk(), new Promise((r) => setTimeout(r, SETTLE))]).then(() => live && setReady(true))
    const cap = setTimeout(() => setTired(true), WAIT_MAX)
    return () => {
      live = false
      clearTimeout(cap)
    }
  }, [])
  // Drawn when the status has arrived and the page has its numbers (or has been long enough about it).
  const settled = ready && (!loading || tired)
  useKeymap()
  const ask = useSyncExternalStore(marked, askOffered, () => false) && canAsk()
  const whatsNew = (
    <>
      {newer && <i className="footer-dot" aria-hidden="true" />}
      {version ? `v${version} · ${t.whatsNew}` : t.whatsNew}
      {newer && <span className="sr"> {t.newer(newer)}</span>}
    </>
  )
  return (
    <footer className={settled ? 'app-footer' : 'app-footer app-footer-wait'}>
      <span className="app-footer-start">
        <Suspense fallback={null}>
          <ServerStatus sites={sites} />
        </Suspense>
        <span className="app-footer-keys">
          {ask && <Key id="ask" label={t.ask} />}
          <Key id="filter" label={t.filter} />
          <Key id="shortcuts" label={t.shortcuts} onClick={openShortcuts} />
        </span>
      </span>
      <span className="app-footer-end">
        {newer ? (
          <button type="button" className="footer-new" onClick={onNewer} title={t.newer(newer)}>
            {whatsNew}
          </button>
        ) : (
          <a href={CHANGELOG} className="footer-new">
            {whatsNew}
          </a>
        )}
        <a href={DOCS}>
          <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
          {t.docs}
        </a>
        <button type="button" onClick={() => setFeedback(true)}>
          <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" />
          {t.feedback}
        </button>
        <span className="app-footer-social">
          {SOCIALS.filter((s) => s.url).map((s) => (
            <a key={s.id} href={s.url} aria-label={t.social[s.id]} title={t.social[s.id]} target="_blank" rel="noreferrer">
              <SocialIcon id={s.id} />
            </a>
          ))}
        </span>
      </span>
      {feedback && (
        <Suspense fallback={null}>
          <FeedbackDialog site={site} onClose={() => setFeedback(false)} />
        </Suspense>
      )}
    </footer>
  )
}
