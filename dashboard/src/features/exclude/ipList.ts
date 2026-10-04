// The owner's own addresses, as typed: one IP or range per line, at most 50.
// The server is the judge (ipfilter); this says the same thing before the
// request, so a typo is caught where it is made.
export const MAX_IPS = 50

const v4 = (s: string) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every((o) => +o <= 255)

// The URL parser validates an IPv6 literal; a zone ("%eth0") is not one.
const v6 = (s: string) => {
  if (!s.includes(':') || s.includes('%')) return false
  try {
    return !!new URL(`http://[${s}]/`)
  } catch {
    return false
  }
}

/** One entry: an address, or an address with /bits that fits its kind. */
export function validEntry(raw: string): boolean {
  const s = raw.trim()
  const [addr, bits, extra] = s.split('/')
  if (extra !== undefined) return false
  const four = v4(addr)
  if (!four && !v6(addr)) return false
  if (bits === undefined) return true
  return /^\d{1,3}$/.test(bits) && +bits <= (four ? 32 : 128)
}

export type Parsed = { list: string[]; bad?: string; many?: boolean }

/** The lines of the box without blanks or repeats, and the first problem if any. */
export function parseList(text: string): Parsed {
  const list: string[] = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s || list.includes(s)) continue
    if (!validEntry(s)) return { list, bad: s }
    list.push(s)
  }
  return list.length > MAX_IPS ? { list, many: true } : { list }
}
