// Install with AI, one row: the prompt for Cursor, Copilot or Claude Code, with the site's id,
// domain and server filled in, and where the code goes for the stack, copied in one click.
import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { Ctx, Method } from '../../lib/install'
import { aiPrompt, copy } from './copy'

const t = copy.ai

export function AiCard({ ctx, method }: { ctx: Ctx; method: Method }) {
  const [copied, setCopied] = useState(false)
  const prompt = aiPrompt(ctx, method)
  const take = () =>
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  return (
    <div className="inst-row inst-ai">
      <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="inst-row-label">
        {t.title}
        <small className="inst-ai-hint">{t.hint}</small>
      </span>
      <button type="button" className="btn inst-ai-copy" onClick={take}>
        {copied && <Check size={14} strokeWidth={2} aria-hidden="true" />}
        <span aria-live="polite">{copied ? t.copied : t.button}</span>
      </button>
    </div>
  )
}
