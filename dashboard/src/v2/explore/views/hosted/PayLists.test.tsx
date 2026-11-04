import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../ui/Flag', () => ({ Flag: ({ code }: { code: string }) => <i data-flag={code} /> }))
vi.mock('../../../../components/visitor/Avatar', () => ({ Avatar: ({ id }: { id: string }) => <i data-face={id} /> }))
vi.mock('../../../../components/loading/Loading', () => ({ Loading: () => null }))

const { Who } = await import('./PayLists')

describe('Who', () => {
  it('an unlinked buyer shows the provider country as a flag', () => {
    expect(renderToStaticMarkup(<Who country="DE" name="Ada Lovelace" />)).toContain('data-flag="DE"')
  })
  it('with no country it shows their initials, never a question mark', () => {
    const html = renderToStaticMarkup(<Who name="Ada Lovelace" />)
    expect(html).toContain('>AL<')
    expect(html).not.toContain('?')
  })
  it('a linked visit keeps its face', () => {
    expect(renderToStaticMarkup(<Who visitor="abc" country="DE" name="Calm Koi" />)).toContain('data-face="abc"')
  })
})
