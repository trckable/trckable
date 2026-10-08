import { describe, expect, it } from 'vitest'
import { APIError } from './api'
import { formWords } from './formWords'

describe('formWords', () => {
  it('uses the caller’s words for a status', () => {
    expect(formWords(new APIError(401, 'nope'), { 401: 'Check it.' })).toBe('Check it.')
  })
  it('shows what the server found wrong with what was typed', () => {
    expect(formWords(new APIError(400, 'password must be at least 12 characters'))).toBe('password must be at least 12 characters')
  })
  it('falls back to the friendly line for trouble that is not the field’s fault', () => {
    expect(formWords(new APIError(503, 'down'))).toBe('Server busy · Try again')
    expect(formWords(new TypeError('x'))).toBe("Can't reach the server")
  })
})
