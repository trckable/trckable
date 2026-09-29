// Which of the person's sites an address names: /{domain}. The address may be
// typed by hand, so case and the Unicode or punycode spelling of a name do
// not matter. An address that names none of them goes to their main
// dashboard instead, never to Settings.
import type { Site } from './api'

/** A domain as it is compared: lower case and in its ASCII (punycode) form,
 *  so "Café.example", "caf%C3%A9.example" and "xn--caf-dma.example" meet.
 *  The URL parser does the decoding, the case and the IDN. */
export function canonDomain(raw: string): string {
  try {
    return new URL('http://' + raw).hostname
  } catch {
    return raw.toLowerCase()
  }
}

/** The site a path segment names, or null when it names none of them. */
export function siteForSegment(sites: Site[], segment: string): Site | null {
  if (!segment) return null
  const want = canonDomain(segment)
  return sites.find((s) => canonDomain(s.domain) === want) ?? null
}

/** Where an address that names none of the person's sites goes: the first
 *  site's dashboard, or, with no site at all, the first run (three steps to
 *  a first visit) at the root, which cannot be left before a site exists. */
export function redirectFor(sites: Site[]): { path: string; wizard: boolean } {
  const first = sites[0]
  if (first) return { path: '/' + encodeURIComponent(first.domain), wizard: false }
  return { path: '/', wizard: true }
}
