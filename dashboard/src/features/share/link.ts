// The public page a card goes out with: a link of the site whose preview picture is the card, at the size of the place
// it goes to. A link that already exists is used when it may carry the card; otherwise one is made that shows the card's
// section and nothing else.
import { more, type Share } from '../../lib/apiMore'
import { copy } from './copy'
import { linkPeriod, pictureParams, sectionsOf, type Look } from './card'

// The public page a card goes out with: a link of the site whose preview picture is the card, at the size of the place
// it goes to. It is always the studio's own link for that card, made to show what the card shows and no more: the
// sections the card is drawn from and the one period it is for. A link made for anything else is never reused, since
// it may show more than the card does.

const same = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x))

/** The studio's link for this card: named by the studio, open to anybody, no revenue, not ended, showing exactly the card's sections and period (for all time, from the site's first day). */
export const linkFor = (links: Share[], l: Pick<Look, 'card' | 'ms' | 'period' | 'from' | 'to'>, first?: string, now = Date.now()): Share | undefined =>
  links.find(
    (x) =>
      x.url && x.name === copy.linkName && !x.has_password && !x.revenue && (!x.expires_at || x.expires_at * 1000 > now) && same(x.sections ?? [], sectionsOf(l)) && (x.period ?? '') === linkPeriod(l, first),
  )

/** The link's address with the card named in it: the page's preview is that card at that size. The period is the link's own, kept on the server, so the address does not name one. */
export function withCard(url: string, l: Look): string {
  const p = pictureParams(l)
  for (const k of ['period', 'from', 'to']) p.delete(k)
  return `${url}?${p}`
}

/** The address a card goes out with: the studio's link for it, made when there is none. */
export async function cardLink(site: string, links: Share[], l: Look, first?: string): Promise<string> {
  const have = linkFor(links, l, first)
  if (have?.url) return withCard(have.url, l)
  const made = await more.createShare(site, { name: copy.linkName, revenue: false, days: 0, sections: sectionsOf(l), period: linkPeriod(l, first) })
  return withCard(made.url, l)
}
