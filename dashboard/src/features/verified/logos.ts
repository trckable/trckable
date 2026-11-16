// The marks of the payment providers that vouch for a section's numbers, keyed by the id the verified list uses.
// logos.json is the file the share pictures draw too (server/internal/cards/logos/sources.json: a test keeps the two
// equal): Stripe, Paddle, Lemon Squeezy and Dodo Payments are Simple Icons marks (https://simpleicons.org, CC0 1.0),
// their 24 by 24 path unchanged. A brand mark keeps its brand colour, the one exception to the page's own colours;
// "ink" is the text colour, and "light" the colour on a light page where the brand's does not read.
// TODO: official Polar mark: Simple Icons has none, a plain disc stands in.
import marks from './logos.json'

export interface Logo {
  name: string
  color: string
  light?: string
  d: string
}

const ALL = marks as Record<string, Logo>

export const logoOf = (id: string): Logo | undefined => ALL[id]

/** The fill of a logo, and whether it changes on a light page (the CSS then takes the text colour). */
export function markStyle(m: Logo): { fill: string; light: boolean } {
  return { fill: m.color === 'ink' ? 'currentColor' : m.color, light: m.light === 'ink' }
}
