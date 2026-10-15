// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT, setLayer } from './settings'

describe('markers settings', () => {
  beforeEach(() => localStorage.clear())
  it('defaults: sources, links and moments on; goals off', () => {
    expect(DEFAULT).toEqual({ sources: true, links: true, goals: false, moments: true })
  })
  it('keeps a choice in this browser, with the others as they were', () => {
    setLayer('goals', true)
    setLayer('sources', false)
    expect(JSON.parse(localStorage.getItem('trckable:markers') ?? '{}')).toEqual({ sources: false, links: true, goals: true, moments: true })
  })
})
