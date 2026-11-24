// @vitest-environment happy-dom
// A goal's icon comes from its kind, with one default; a row's marks carry their words.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ClipboardList, Download, ExternalLink, FileText, Target, UserPlus } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { DeviceIcon, PlaceIcon, SourceIcon, goalIcon } from './goalMarks'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('goalIcon', () => {
  it('picks the icon of a goal kind, a page visit for a page goal, and one default', () => {
    expect(goalIcon({ goal: 'outbound_click' })).toBe(ExternalLink)
    expect(goalIcon({ goal: 'form_submit' })).toBe(ClipboardList)
    expect(goalIcon({ goal: 'signed-up' })).toBe(UserPlus)
    expect(goalIcon({ goal: 'App download' })).toBe(Download)
    expect(goalIcon({ goal: 'pricing', page: true })).toBe(FileText)
    expect(goalIcon({ goal: 'nudge' })).toBe(Target)
  })
})

describe('the marks of a row', () => {
  it('name the source, the country and the device as a title and a label', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() =>
      root.render(
        <>
          <SourceIcon source="google.com" />
          <PlaceIcon country="DE" />
          <DeviceIcon device="mobile" os="iOS" />
        </>,
      ),
    )
    const labels = [...host.querySelectorAll('[role="img"].gs-ico')].map((e) => [e.getAttribute('title'), e.getAttribute('aria-label')])
    expect(labels).toEqual([
      ['Google', 'Google'],
      ['Germany', 'Germany'],
      ['iPhone', 'iPhone'],
    ])
    act(() => root.unmount())
  })
})
