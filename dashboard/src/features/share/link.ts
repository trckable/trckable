// The public page a card goes out with: a link of the site whose preview picture is the card, at the size of the place
// it goes to. A link that already exists is used when it may carry the card; otherwise one is made that shows the card's
// section and nothing else.
import { more, type Share } from '../../lib/apiMore'
import { copy } from './copy'
import { hasPeriod, linkPeriod, pictureParams, sectionsOf, type Look } from './card'

// The public page a card goes out with: a link of the site whose preview picture is the card, at the size of the place
// it goes to. It is always the studio's own link for that card, made to show what the card shows and no more: the
// sections the card is drawn from and the one period it is for. A link made for anything else is never reused, since
// it may show more than the card does.

const same = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x))

/** The studio's link for this card: named by the studio, open to anybody, no revenue, not ended, showing exactly the card's sections and period. */
export const linkFor = (links: Share[], l: Pick<Look, 'card' | 'ms' | 'period'>, now = Date.now()): Share | undefined =>
  links.find(
    (x) =>
      x.url && x.name === copy.linkName && !x.has_password && !x.revenue && (!x.expires_at || x.expires_at * 1000 > now) && same(x.sections ?? [], sectionsOf(l)) && (x.period ?? '') === linkPeriod(l),
  )

/** Whether a link can carry the card: not while the card is for all time, which no link shows (a link shows up to 30 days, or a year). */
export const linkable = (l: Pick<Look, 'card' | 'period'>) => !(hasPeriod(l.card) && l.period === 'all')

/** The link's address with the card named in it: the page's preview is that card at that size. */
export const withCard = (url: string, l: Look) => `${url}?${pictureParams(l)}`

/** The address a card goes out with: the studio's link for it, made when there is none. */
export async function cardLink(site: string, links: Share[], l: Look): Promise<string> {
  const have = linkFor(links, l)
  if (have?.url) return withCard(have.url, l)
  const made = await more.createShare(site, { name: copy.linkName, revenue: false, days: 0, sections: sectionsOf(l), period: linkPeriod(l) })
  return withCard(made.url, l)
}
