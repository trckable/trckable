import { describe, expect, it } from 'vitest'
import { assistantOf } from './assistants'

describe('AI assistants', () => {
  it('names an assistant from its referrer, however the host is written', () => {
    expect([assistantOf('chatgpt.com'), assistantOf('chat.openai.com'), assistantOf('www.perplexity.ai'), assistantOf('gemini.google.com'), assistantOf('claude.ai')]).toEqual(['ChatGPT', 'ChatGPT', 'Perplexity', 'Gemini', 'Claude'])
    expect(assistantOf('some.new-assistant.example')).toBe('some.new-assistant.example')
    expect(assistantOf('')).toBe('(unknown)')
  })
})
