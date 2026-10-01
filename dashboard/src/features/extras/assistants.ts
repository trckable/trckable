// The AI assistants by name: the referrers the channel rules (server ingest)
// put in the AI channel, grouped under the product people know them by.
// Pure: assistants.test.ts.
import type { Row } from '../../lib/api'

const NAMES: [string, string][] = [
  ['chatgpt.com', 'ChatGPT'],
  ['chat.openai.com', 'ChatGPT'],
  ['openai.com', 'ChatGPT'],
  ['perplexity.ai', 'Perplexity'],
  ['claude.ai', 'Claude'],
  ['gemini.google.com', 'Gemini'],
  ['bard.google.com', 'Gemini'],
  ['copilot.microsoft.com', 'Copilot'],
  ['bing.com', 'Copilot'],
  ['deepseek.com', 'DeepSeek'],
  ['grok.com', 'Grok'],
  ['meta.ai', 'Meta AI'],
  ['mistral.ai', 'Mistral'],
  ['you.com', 'You.com'],
  ['phind.com', 'Phind'],
  ['poe.com', 'Poe'],
  ['kagi.com', 'Kagi'],
]

/** The assistant a referrer belongs to; the referrer itself when it is none we know. */
export function assistantOf(referrer: string): string {
  const host = referrer.toLowerCase().replace(/^www\./, '')
  return NAMES.find(([h]) => host === h || host.endsWith('.' + h) || host.startsWith(h + '/'))?.[1] ?? (referrer || '(unknown)')
}

/** Rows grouped by assistant, the busiest first, each with the referrer that sent most of it (what a click filters by). */
export function byAssistant(rows: Row[]): { name: string; visitors: number; referrer: string }[] {
  const by = new Map<string, { visitors: number; referrer: string; top: number }>()
  for (const r of rows) {
    const name = assistantOf(r.value)
    const a = by.get(name) ?? { visitors: 0, referrer: r.value, top: -1 }
    a.visitors += r.visitors
    if (r.visitors > a.top) {
      a.referrer = r.value
      a.top = r.visitors
    }
    by.set(name, a)
  }
  return [...by].map(([name, a]) => ({ name, visitors: a.visitors, referrer: a.referrer })).sort((a, b) => b.visitors - a.visitors || a.name.localeCompare(b.name))
}
