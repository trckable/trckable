// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { Toolbar } from './Toolbar'

const none = () => {}
const bar = (noTabs = false) =>
  renderToStaticMarkup(
    <Toolbar noTabs={noTabs} section="overview" tab="overview" filters={[]} options={{}} conn={{ rev: true, search: true, goals: true }} menu={null} views={{ views: [], manage: false, canSave: false, onApply: none, onDelete: none, onManage: none, onSave: none }} details onMenu={none} onSection={none} onTab={none} onRemove={none} onClear={none} onDetails={none} onCsv={none} onCopy={none} />,
  )

describe('the ⋯ button', () => {
  afterEach(() => vi.restoreAllMocks())
  it('is not on a shared link: nothing under it is for a stranger', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    expect(bar()).not.toContain('xmore')
  })
  it('is there for a signed-in view', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    expect(bar()).toContain('xmore')
  })
})

describe('the page header', () => {
  it('has the subtitle in the same row as the title, with its words as the title attribute', () => {
    const html = bar(true)
    expect(html).toContain('class="xtitle-sub" title="Numbers, trends, highlights"')
    expect(html).not.toContain('xpage-desc')
  })
})
