// Step 2 of the crawler wizard: the code for the chosen platform, folded to a
// few lines, one big button that copies all of it, and the key where the
// platform keeps its secrets.
import { useState } from 'react'
import { CodeBlock } from '../../components/Code'
import { fail } from '../../lib/apiMore'
import { copy } from './copy'
import { snippetsFor, type Plan, type Setup } from './snippets'

const t = copy.setup
const KEY_IN_ENV: Setup[] = ['cloudflare', 'vercel']

/** A copy button that says so for a moment. */
function CopyButton({ value, label, done, big }: { value: string; label: string; done: string; big?: boolean }) {
  const [copied, setCopied] = useState(false)
  const run = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch((e: unknown) => fail(e, run))
  }
  return (
    <button type="button" className={'btn' + (big ? ' primary big' : '')} onClick={run}>
      {copied ? done : label}
    </button>
  )
}

export function CrawlerCode({ setup, plan }: { setup: Setup; plan: Plan }) {
  const [open, setOpen] = useState(false)
  const snippets = snippetsFor(setup, plan)
  return (
    <div className="cs-code">
      <div className={'cs-fold' + (open ? ' open' : '')}>
        {snippets.map((s) => (
          <div key={s.id} className="cs-snippet">
            <span className="faint cs-caption">{t.captions[s.id]}</span>
            <CodeBlock lang={s.lang} code={s.code} />
          </div>
        ))}
      </div>
      <div className="cs-row">
        <CopyButton big value={snippets.map((s) => s.code).join('\n\n')} label={t.copyCode} done={t.codeCopied} />
        <button type="button" className="cs-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t.showLess : t.showAll}
        </button>
      </div>
      {KEY_IN_ENV.includes(setup) && (
        <div className="cs-key">
          <span className="faint">{t.keyPaste}</span>
          <CopyButton value={plan.key} label={t.copyKey} done={t.keyCopied} />
        </div>
      )}
    </div>
  )
}
