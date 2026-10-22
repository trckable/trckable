// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { moveBefore, pointedBefore, stepOrder } from './listOrder'

describe('list order', () => {
  it('moves a row before another, or last', () => {
    expect(moveBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moveBefore(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
    expect(moveBefore(['a', 'b'], 'a', 'zzz')).toEqual(['a', 'b'])
  })
  it('steps one place and stops at the ends', () => {
    expect(stepOrder(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(stepOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(stepOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
  })
  it('says where the pointer puts a row', () => {
    const box = document.createElement('div')
    box.innerHTML = ['a', 'b', 'c'].map((id) => `<div data-team="${id}"></div>`).join('')
    const rows = [...box.children] as HTMLElement[]
    rows.forEach((r, i) => {
      r.getBoundingClientRect = () => ({ top: i * 40, bottom: i * 40 + 40, height: 40 }) as DOMRect
    })
    expect(pointedBefore(box, 'team', 'a', 50)).toEqual({ before: 'b' }) // upper half of b
    expect(pointedBefore(box, 'team', 'a', 110)).toEqual({ before: undefined }) // lower half of c: last
    expect(pointedBefore(box, 'team', 'c', 110)).toBeNull() // over itself
    expect(pointedBefore(box, 'team', 'a', 500)).toBeNull()
  })
})
