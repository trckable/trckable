import { mentionsApi, type LookAlike } from './api'

/** What the news says about a word that is about to be added: nothing against it, another meaning, or that it could not be asked. */
export type Meaning = { kind: 'clear' } | { kind: 'other'; look: LookAlike } | { kind: 'unchecked' }

export async function otherMeaning(site: string, word: string): Promise<Meaning> {
  try {
    const r = await mentionsApi.lookAlike(site, word)
    if (!r.checked) return { kind: 'unchecked' }
    return r.elsewhere > 0 ? { kind: 'other', look: r } : { kind: 'clear' }
  } catch {
    return { kind: 'unchecked' }
  }
}
