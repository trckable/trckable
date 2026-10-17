import { mentionsApi, type LookAlike } from './api'

/** The news's other meaning of a word, when it has one; null when the news says nothing against it or could not be read. */
export async function otherMeaning(site: string, word: string): Promise<LookAlike | null> {
  try {
    const r = await mentionsApi.lookAlike(site, word)
    return r.checked && r.elsewhere > 0 ? r : null
  } catch {
    return null
  }
}
