// Whether a check passed, with no words: the chip on the sites list reads this on first load, so it must not reach
// the install guide's wording (rows.ts, which does, is only for the modal that opens on a click).
import type { InstallCheck } from '../../lib/api'

/** The tag was found on the homepage, or in a script it loads. */
export const tagOk = (c: InstallCheck) => c.found === 'site'

/** The script answered with a success or a redirect. */
export const scriptOk = (status: number | undefined) => (status ?? 0) >= 200 && (status ?? 0) < 400

/** Any check failing: the page could not be read, the tag is missing, or the script does not load. */
export function failsOf(c: InstallCheck): boolean {
  return !!c.error || !tagOk(c) || (!!c.script && !scriptOk(c.script_status))
}
