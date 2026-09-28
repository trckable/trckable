// Install with AI: one prompt, complete enough that Cursor, Copilot or Claude
// Code needs nothing else. The prompt can be read before it is copied.
import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { CodeBlock } from '../../components/Code'
import type { Ctx, Method } from '../../lib/install'
import { aiPrompt, copy } from './copy'

const t = copy.ai

export function AiCard({ ctx, method }: { ctx: Ctx; method: Method }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const prompt = aiPrompt(ctx, method)
  const take = () =>
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  return (
    <section className="inst-ai" aria-labelledby="inst-ai-title">
      <span className="icon-tile" aria-hidden="true">
        <Sparkles size={18} strokeWidth={1.75} />
      </span>
      <div className="inst-ai-text">
        <h3 id="inst-ai-title">{t.title}</h3>
        <p className="faint">{t.body}</p>
        <button type="button" className="linkish" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t.preview}
        </button>
      </div>
      <button type="button" className="btn inst-ai-copy" onClick={take}>
        {copied && <Check size={15} strokeWidth={2} aria-hidden="true" />}
        <span aria-live="polite">{copied ? t.copied : t.button}</span>
      </button>
      {open && (
        <div className="inst-ai-prompt">
          <CodeBlock code={prompt} lang="markdown" copyLabel={t.button} />
        </div>
      )}
    </section>
  )
}
