import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Glide, marksOf, parse, resample, write } from './glide'

describe('the glide', () => {
  it('reads a list at other places: the same list at its own length, a line at more or fewer points', () => {
    expect(resample([1, 2, 3], 3)).toEqual([1, 2, 3])
    expect(resample([0, 10], 5)).toEqual([0, 2.5, 5, 7.5, 10])
    expect(resample([0, 10, 20], 2)).toEqual([0, 20])
    expect(resample([], 3)).toEqual([0, 0, 0])
    expect(resample([7], 3)).toEqual([7, 7, 7])
  })

  it('shows a number as it is written when it has not moved, and anything else untouched', () => {
    expect(renderToStaticMarkup(<Glide name="a" text="1,284" />)).toBe('1,284')
    expect(renderToStaticMarkup(<Glide name="b" text="$305" />)).toBe('$305')
    expect(renderToStaticMarkup(<Glide name="c" text="42%" />)).toBe('42%')
    expect(renderToStaticMarkup(<Glide name="d" text="2m 10s" />)).toBe('2m 10s')
    expect(renderToStaticMarkup(<Glide name="e" text="–" />)).toBe('–')
  })

  it('reads and writes numbers in the language: German "12,3 %", "3,4 s" and "1.284", French with its own spaces', () => {
    const de = marksOf('de')
    expect(parse('1.284', de)?.n).toBe(1284)
    expect(parse('3,4 s', de)).toMatchObject({ n: 3.4, dec: 1, post: ' s' })
    expect(parse('12,3 %', de)).toMatchObject({ n: 12.3, dec: 1 })
    const p = parse('3,4 s', de)!
    expect(write(p, 5.25, de)).toBe('5,3 s')
    expect(write(parse('1.284', de)!, 2500, de)).toBe('2.500')
    const fr = marksOf('fr')
    expect(parse(`1${fr.group}284`, fr)?.n).toBe(1284)
    expect(parse('3.4 s', marksOf('en-US'))?.n).toBe(3.4)
  })
})
