// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { MoreMenu } from './menus'
import { copy } from './copy'

const menu = () => renderToStaticMarkup(<MoreMenu views={{ views: [], manage: false, canSave: false, onApply: () => {}, onDelete: () => {}, onManage: () => {}, onSave: () => {} }} details onDetails={() => {}} onCsv={() => {}} onCopy={() => {}} />)

describe('the ⋯ menu', () => {
  afterEach(() => vi.restoreAllMocks())
  it('on a shared link holds the page details and the link, not saved views or the table as a file', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    const html = menu()
    expect(html).toContain('data-copy')
    expect(html).toContain('data-pgd')
    expect(html).not.toContain(copy.saveView)
    expect(html).not.toContain('xCsv')
  })
  it('keeps them for a signed-in view', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    const html = menu()
    expect(html).toContain(copy.saveView)
    expect(html).toContain('xCsv')
  })
})
