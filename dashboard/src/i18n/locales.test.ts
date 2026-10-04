// The check on the message files: every key of the English words exists in
// every language, nothing is left over, a function keeps its shape and still
// writes what it is given. A language marked partial in languages.ts is only
// listed. English is the words written in the code: each defineCopy call
// registers them here, so nothing is listed twice.
import { writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Messages } from './index'
import { LANGUAGES } from './languages'

const registry = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./index', () => ({
  lang: 'en',
  tag: undefined,
  intl: {},
  defineCopy: (ns: string, en: unknown) => {
    if (registry.has(ns)) throw new Error(`two copies are called ${ns}`)
    registry.set(ns, en)
    return en
  },
}))

type Leaf = string | string[] | ((...a: unknown[]) => unknown)
const letters = /\p{L}/u

/** A function has words to translate when a string in it has letters: a quoted one, or the text of a template outside its `${…}` holes. */
const speaks = (fn: (...a: unknown[]) => unknown) => {
  const src = String(fn)
  const strings = [...src.matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g), ...src.replace(/\$\{[^}]*\}/g, '').matchAll(/`(?:[^`\\]|\\.)*`/g)]
  return strings.some((m) => letters.test(m[0]))
}

/** The leaves of an English copy, by key (a leaf is a string, a list of strings or a function). `all`: also those with no words in them (a function that only formats). */
function leaves(en: unknown, key: string, all: boolean, out: Map<string, Leaf> = new Map()) {
  if ((key.endsWith('.id') || key.includes('.langNames.')) && !all) return out // an identifier or a language's own name, not words to translate
  if (typeof en === 'string') {
    if (all || (letters.test(en) && !/^https?:/.test(en))) out.set(key, en)
  } else if (typeof en === 'function') {
    if (all || speaks(en as (...a: unknown[]) => unknown)) out.set(key, en as Leaf)
  } else if (Array.isArray(en) && en.every((x) => typeof x === 'string')) {
    if (all || en.some((x: string) => letters.test(x))) out.set(key, en)
  } else if (typeof en === 'object' && en !== null) for (const [k, v] of Object.entries(en)) leaves(v, key + '.' + k, all, out)
  return out
}

// Every module that writes defineCopy: found by reading the sources, then loaded.
const sources: Record<string, string> = import.meta.glob(['../**/*.ts', '!../**/*.test.ts', '!../i18n/**'], { query: '?raw', import: 'default', eager: true })
const loaders = import.meta.glob(['../**/*.ts', '!../**/*.test.ts', '!../i18n/**'])
const english = new Map<string, Leaf>() // what a message file must have
const known = new Map<string, Leaf>() // and every key it may have
const files = Object.entries(sources).filter(([, text]) => text.includes('defineCopy('))
await Promise.all(files.map(([path]) => loaders[path]()))
for (const [ns, en] of registry) {
  leaves(en, ns, false, english)
  leaves(en, ns, true, known)
}
if (process.env.I18N_DUMP) writeFileSync(process.env.I18N_DUMP, JSON.stringify(Object.fromEntries([...english].map(([k, v]) => [k, typeof v === 'function' ? null : v]))))
const catalogs = import.meta.glob<{ default: Messages }>('./locales/??.ts', { eager: true })

/** Arguments to try a function with: tokens that show up in what it writes, numbers either side of one, a list, an object that has every field. */
const probes = (n: number): unknown[][] => [
  Array.from({ length: n }, (_, i) => `§${i}§`),
  Array.from({ length: n }, () => 1),
  Array.from({ length: n }, () => 2),
  Array.from({ length: n }, () => 0),
  Array.from({ length: n }, (_, i) => [`§${i}§`]),
  Array.from({ length: n }, () => new Proxy({}, { get: () => 3 })),
  Array.from({ length: n }, () => true),
  Array.from({ length: n }, () => false),
]
const probe = (fn: (...a: unknown[]) => unknown, args: unknown[]) => {
  try {
    const out = fn(...args)
    return typeof out === 'string' ? out : null
  } catch {
    return null
  }
}

describe('the message files', () => {
  it('are reached from every file of words (the loading ghost’s is read by the build and wrapped where the app reads it)', () => {
    const unwrapped = Object.keys(sources).filter((f) => /(^|\/)[a-zA-Z]*[cC]opy(Later)?\.ts$/.test(f) && !f.includes('/loading/') && !sources[f].includes('defineCopy('))
    expect(unwrapped, `these hold words but never call defineCopy, so no language reaches them:\n${unwrapped.join('\n')}`).toEqual([])
  })

  it('find every copy of the English words, once', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(registry.size).toBeGreaterThanOrEqual(files.length)
    expect(english.size).toBeGreaterThan(1000)
  })

  it('exist for every language the picker offers', () => {
    const have = Object.keys(catalogs).map((f) => f.slice(10, 12))
    expect(have.sort()).toEqual(LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code).sort())
  })

  for (const { code, partial } of LANGUAGES.filter((l) => l.code !== 'en')) {
    describe(code, () => {
      const messages = catalogs[`./locales/${code}.ts`]?.default ?? {}

      it('has every key' + (partial ? ' (partial: listed only)' : ''), () => {
        const missing = [...english.keys()].filter((k) => !(k in messages))
        if (partial) console.log(`${code}: ${missing.length} keys fall back to English`)
        else expect(missing, `${code} is missing ${missing.length} keys, English shows there:\n${missing.join('\n')}`).toEqual([])
      })

      it('has no key that English does not', () => {
        const extra = Object.keys(messages).filter((k) => !known.has(k))
        expect(extra, `${code} has keys the English words do not:\n${extra.join('\n')}`).toEqual([])
      })

      it('keeps the kind of every key, and the shape of every function', () => {
        const wrong: string[] = []
        for (const [k, en] of known) {
          const t = (messages as Record<string, unknown>)[k]
          if (t === undefined) continue
          const kind = (v: unknown) => (Array.isArray(v) ? `list of ${v.length}` : typeof v)
          if (kind(t) !== kind(en)) wrong.push(`${k}: ${kind(en)} in English, ${kind(t)} here`)
          else if (typeof en === 'function' && (t as () => void).length !== en.length) wrong.push(`${k}: ${en.length} arguments in English, ${(t as () => void).length} here`)
        }
        expect(wrong).toEqual([])
      })

      it('writes every function with what it is given', () => {
        const bad: string[] = []
        for (const [k, en] of known) {
          const t: unknown = (messages as Record<string, unknown>)[k]
          if (typeof en !== 'function' || typeof t !== 'function') continue
          for (const args of probes(en.length)) {
            const want = probe(en, args)
            if (want === null) continue
            const got = probe(t as (...a: unknown[]) => unknown, args)
            if (got === null) bad.push(`${k}: English writes "${want}", this one fails with ${JSON.stringify(args).slice(0, 40)}`)
            else {
              for (const token of want.match(/§\d§/g) ?? []) if (!got.includes(token)) bad.push(`${k}: leaves out ${token} (English: "${want}", here: "${got}")`)
              if (/undefined|\[object/.test(got) && !/undefined|\[object/.test(want)) bad.push(`${k}: writes "${got}"`)
              if (args.every((a) => typeof a === 'number') && /NaN/.test(got) && !/NaN/.test(want)) bad.push(`${k}: writes "${got}"`)
            }
          }
        }
        expect(bad).toEqual([])
      })

      it('says some of it in its own words', () => {
        const same = Object.entries(messages).filter(([k, v]) => typeof v === 'string' && v === english.get(k)).length
        expect(same / Math.max(1, Object.keys(messages).length)).toBeLessThan(0.35)
      })
    })
  }
})
