// One word for a person who arrived on the site: "people" ("1 person"). The English
// words written in the code never say "visitor(s)", so the dashboard, its pop-ups,
// the share dialog and the messages all keep one name. Code identifiers keep their
// names (a `visitors` key is not a word anyone reads), so only quoted text and
// the text of a template are read, outside comments.
import { describe, expect, it } from 'vitest'

const word = /\bvisitors?\b/i

/** Files that write English words for people to read: every copy file, the views that carry their own text, the dialogs that explain what is counted. */
const sources: Record<string, string> = import.meta.glob(
  ['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../i18n/locales/**', '!../dev/**'],
  { query: '?raw', import: 'default', eager: true },
)
const readers = (path: string, text: string) => /copy/i.test(path) || text.includes('defineCopy(') || /^\.\.\/views\/[A-Za-z]+\.tsx$/.test(path)

/** The quoted text of a source: strings and the words of a template (not its `${…}` holes), comments removed. */
function quoted(text: string): string[] {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  const holes = bare.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
  return [...holes.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0])
}

/** Quoted words that name the thing in code (an API field, a URL parameter, a type's member), not words anyone reads. Each says why. */
const identifiers: Record<string, string[]> = {
  'views/DataRequest.tsx': ["'visitor'"], // the lookup kind the API takes and the `visitor` URL parameter
  'views/PaymentsManual.tsx': ['visitor: vid', 'visitor comes from'], // the field of the payments API, shown in the example request
}

describe('the word for a person', () => {
  const found: string[] = []
  for (const [path, text] of Object.entries(sources)) {
    if (!readers(path, text)) continue
    const short = path.replace('../', '')
    const allowed = identifiers[short] ?? []
    for (const q of quoted(text)) if (word.test(q) && !allowed.some((a) => q.includes(a))) found.push(`${short}: ${q.slice(0, 90)}`)
  }
  it('is people, not visitors, in every English text', () => {
    expect(found).toEqual([])
  })
})
