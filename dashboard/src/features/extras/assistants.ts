// The AI assistants by name: the referrers the channel rules (server ingest)
// put in the AI channel, under the product people know them by.
// (The AI view's rows are grouped by the server, which also reads utm_source.)
// Pure: assistants.test.ts.

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
