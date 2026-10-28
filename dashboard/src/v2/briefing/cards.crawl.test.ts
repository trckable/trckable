import { describe, expect, it } from 'vitest'
import { assistantOfRobot, crawlCard, type Robot } from './cards.crawl'

const bot = (o: Partial<Robot>): Robot => ({ name: 'OpenAI', kind: 'answer', hits: 30, blocked: 0, errors: 0, ...o })

describe('the robot that cannot read the site', () => {
  it('fires for an answer robot with 60% of 30 visits blocked, and says so', () => {
    const c = crawlCard([bot({ blocked: 18 })])
    expect(c).toMatchObject({ key: 'crawlers', bad: true, head: 'ChatGPT can’t read your site', why: '60% of OpenAI’s 30 visits were blocked by your server or CDN.' })
    expect(c?.act).toMatchObject({ k: 'link', t: 'How to let it in' })
    expect(c?.ev).toBe('30 visits: 18 blocked, 0 on broken pages.')
  })
  it('says broken pages when they dominate', () => {
    expect(crawlCard([bot({ blocked: 2, errors: 20 })])?.why).toBe('73% of OpenAI’s 30 visits hit broken pages.')
  })
  it('also fires for an index robot', () => {
    expect(crawlCard([bot({ name: 'Google', kind: 'index', errors: 25 })])?.head).toBe('Google can’t read your site')
  })
  it('never fires for a training robot', () => {
    expect(crawlCard([bot({ kind: 'train', blocked: 30 })])).toBeNull()
  })
  it('needs 20 visits', () => {
    expect(crawlCard([bot({ hits: 19, blocked: 19 })])).toBeNull()
    expect(crawlCard([bot({ hits: 20, blocked: 10 })])).not.toBeNull()
  })
  it('stays quiet under half', () => {
    expect(crawlCard([bot({ blocked: 14 })])).toBeNull()
  })
  it('picks the worst of several', () => {
    const c = crawlCard([bot({ blocked: 16 }), bot({ name: 'Anthropic', blocked: 27 }), bot({ name: 'Perplexity', blocked: 12 })])
    expect(c?.head).toBe('Claude can’t read your site')
  })
  it('names the assistants people know', () => {
    expect(['OpenAI', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot', 'Mistral'].map(assistantOfRobot)).toEqual(['ChatGPT', 'ChatGPT', 'Claude', 'Perplexity', 'Google', 'Mistral'])
  })
})
