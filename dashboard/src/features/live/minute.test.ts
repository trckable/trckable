import { describe, expect, it } from 'vitest'
import { writeView, readView } from '../../lib/url'
import { minuteView } from './minute'

const view = (patch: ReturnType<typeof minuteView>) => writeView({ ...readView(new URLSearchParams('view=live&f=channel%3ASearch')), ...patch })

describe('a minute on Live, opened in Data', () => {
  it('is Now by the hour when the minute is today, filters kept', () => {
    expect(view(minuteView(5, 'UTC', new Date('2026-09-28T12:00:00Z')))).toBe('?period=now&f=channel%3ASearch&bucket=hour')
  })

  it('is that day by the hour when the minute was before midnight', () => {
    expect(view(minuteView(20, 'UTC', new Date('2026-09-28T00:10:00Z')))).toBe('?from=2026-09-27&to=2026-09-27&f=channel%3ASearch&bucket=hour')
  })

  it('reads the day in the site\'s time zone', () => {
    expect(minuteView(0, 'Asia/Tokyo', new Date('2026-09-28T02:00:00Z')).period).toBe('now')
  })
})
