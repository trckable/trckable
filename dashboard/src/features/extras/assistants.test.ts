import { describe, expect, it } from 'vitest'
import { assistantOf, byAssistant } from './assistants'

describe('AI assistants', () => {
  it('names an assistant from its referrer, however the host is written', () => {
    expect([assistantOf('chatgpt.com'), assistantOf('chat.openai.com'), assistantOf('www.perplexity.ai'), assistantOf('gemini.google.com'), assistantOf('claude.ai')]).toEqual(['ChatGPT', 'ChatGPT', 'Perplexity', 'Gemini', 'Claude'])
    expect(assistantOf('some.new-assistant.example')).toBe('some.new-assistant.example')
    expect(assistantOf('')).toBe('(unknown)')
  })

  it('groups the referrers of one assistant and puts the busiest first', () => {
    const rows = [
      { value: 'chat.openai.com', visitors: 10 },
      { value: 'claude.ai', visitors: 40 },
      { value: 'chatgpt.com', visitors: 35 },
    ]
    expect(byAssistant(rows)).toEqual([
      { name: 'ChatGPT', visitors: 45, referrer: 'chatgpt.com' },
      { name: 'Claude', visitors: 40, referrer: 'claude.ai' },
    ])
  })
})
