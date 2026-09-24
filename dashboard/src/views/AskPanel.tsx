// "Ask trckable". Today it connects your own AI assistant over MCP (same
// read-only tools, scoped to this instance's data). The in-app chat on the same
// tools turns on once the owner adds an AI key (next release).
import { useEffect, useRef, useState } from 'react'
import { api, type Site } from '../lib/api'
import { CodeBlock } from '../components/Code'
import { Name } from '../components/Logo'
import { openAccount } from '../lib/account'

export function AskPanel({ open, onClose, site, sites = [] }: { open: boolean; onClose: () => void; site: Site; sites?: Site[] }) {
  const ref = useRef<HTMLElement>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const host = location.origin
  const domains = (sites.length ? sites : [site]).map((s) => s.domain).slice(0, 2).join(' and ')
  const key = secret ?? 'tkb_live_…'
  const config = `{
  "mcpServers": {
    "trckable": {
      "command": "npx",
      "args": ["-y", "trckable", "mcp"],
      "env": {
        "TRCKABLE_HOST": "${host}",
        "TRCKABLE_API_KEY": "${key}"
      }
    }
  }
}`
  return (
    <aside ref={ref} className="drawer" aria-label="Ask trckable" aria-hidden={!open} inert={!open}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--grid)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2>
            Ask <Name />
          </h2>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)', background: 'var(--row)', borderRadius: 999, padding: '3px 8px' }}>Your own AI</span>
          <button type="button" className="btn icon ghost" aria-label="Close Ask trckable" onClick={onClose}>
            ×
          </button>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          One assistant for {sites.length > 1 ? `all ${sites.length} of your sites` : 'every site on this server'}. Every number comes from a trckable tool, never a guess.
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Ask from your AI assistant</div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Connect any MCP-capable assistant and ask across your sites: “which channel made the most money this month?”, “compare {domains}”, “what changed since Monday?”. Eight read-only tools; it
            can't change anything.
          </p>
        </div>
        {/* Two steps, two buttons. The key is shown once, big and copyable,
            and the config below it already carries it. */}
        <div className="step">
          <div className="step-head">
            <span className="step-n">1</span>
            <b>Create a key for your assistant</b>
          </div>
          {secret ? (
            <div className="keybox">
              <code>{secret}</code>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  navigator.clipboard?.writeText(secret).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  })
                }}
              >
                {copied ? 'Copied' : 'Copy key'}
              </button>
              <span className="faint">Shown once. It is already filled into the config below.</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn primary big"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setError(null)
                  api
                    .createKey('Assistant · ' + new Date().toLocaleDateString())
                    .then((r) => setSecret(r.secret))
                    .catch((e) => setError(e instanceof Error ? e.message : 'Could not create the key'))
                    .finally(() => setBusy(false))
                }}
              >
                {busy ? 'Creating…' : 'Create key'}
              </button>
              {error && (
                <span className="chip" style={{ borderColor: 'var(--down)', color: 'var(--down)' }}>
                  {error}
                </span>
              )}
            </>
          )}
        </div>

        <div className="step">
          <div className="step-head">
            <span className="step-n">2</span>
            <b>Paste this into your assistant</b>
          </div>
          <CodeBlock code={config} />
          <span className="faint" style={{ fontSize: 12 }}>
            Claude Code, Claude Desktop, Cursor and anything else that speaks MCP. Eight read-only tools, nothing can be changed.
          </span>
        </div>

        <div className="banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <strong style={{ color: 'var(--text)' }}>Chat right here, coming next</strong>
          <span>The built-in chat uses the same tools with your own AI key (Anthropic, OpenAI-compatible or local Ollama). Off until you add a key, so it costs nothing.</span>
        </div>
        <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => openAccount('keys')}>
          Manage API keys →
        </button>
      </div>
    </aside>
  )
}
