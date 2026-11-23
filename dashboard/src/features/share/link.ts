// The public page a card goes out with: a link of the site whose preview picture is the card, at the size of the place
// it goes to. A link that already exists is used when it may carry the card; otherwise one is made that shows the card's
// section and nothing else.
import { more, type Share } from '../../lib/apiMore'
import { copy } from './copy'
import { cardOf, pictureParams, type Look } from './card'

/** A link the card may go out with: one anybody can open, that shows no revenue, has not ended, and shows the section the card is drawn from. */
export const linkFor = (links: Share[], section: string, now = Date.now()): Share | undefined =>
  links.find((l) => l.url && !l.has_password && !l.revenue && (!l.expires_at || l.expires_at * 1000 > now) && (!section || l.sections?.includes(section)))

/** The link's address with the card named in it: the page's preview is that card at that size. */
export const withCard = (url: string, l: Look) => `${url}?${pictureParams(l)}`

/** The address a card goes out with: an existing link, or a new one that shows the card's section only. */
export async function cardLink(site: string, links: Share[], l: Look): Promise<string> {
  const section = cardOf(l.card).section
  const have = linkFor(links, section)
  if (have?.url) return withCard(have.url, l)
  const made = await more.createShare(site, { name: copy.linkName, revenue: false, days: 0, sections: section ? [section] : [] })
  return withCard(made.url, l)
}
