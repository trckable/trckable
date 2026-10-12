import { describe, expect, it } from 'vitest'
import { withCurrent, withUtc } from './site'

describe('the timezone list', () => {
  it('offers UTC first when the browser leaves it out, so a site can go back to it', () => {
    expect(withUtc(['Africa/Abidjan', 'Europe/Tirane'])).toEqual(['UTC', 'Africa/Abidjan', 'Europe/Tirane'])
  })
  it('does not list it twice when the browser has it', () => {
    expect(withUtc(['Africa/Abidjan', 'UTC'])).toEqual(['Africa/Abidjan', 'UTC'])
  })
  it('keeps a zone the list does not know, for the picker that shows the current one', () => {
    expect(withCurrent(withUtc(['Europe/Tirane']), 'Etc/GMT+3').map((x) => x.id)).toEqual(['Etc/GMT+3', 'UTC', 'Europe/Tirane'])
  })
})
