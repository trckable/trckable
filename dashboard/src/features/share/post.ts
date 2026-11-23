// What goes with a card: the post's text, how long X counts it, and the address each network opens with the post and
// the card's link already in it. The link is a public page of the site whose preview picture is the card.

/** X counts every link as 23 characters, and a space before it. */
export const X_LINK = 24
export const X_MAX = 280

/** A text's length in characters (a code point is one, however many code units it takes). */
export const chars = (text: string) => Array.from(text).length

/** The post as X counts it: its text and the link. */
export const xLength = (text: string) => chars(text) + X_LINK

/** The text of the post: the one a person wrote, else the card's own words. */
export const postText = (words: string, edited: string | null) => edited ?? words

/** The post and its link as one text: the link on a line of its own, where every network turns it into a link. */
export const withLink = (text: string, link: string) => `${text}\n${link}`

type Opener = (text: string, link: string) => string
const query = (o: Record<string, string>) => new URLSearchParams(o).toString()

/** The network's own composer, by place: X, Threads and Bluesky take the text; LinkedIn and Facebook only the link (they read the card from it). */
export const OPENERS: Partial<Record<string, Opener>> = {
  x: (text, link) => `https://x.com/intent/post?${query({ text, url: link })}`,
  linkedin: (_text, link) => `https://www.linkedin.com/sharing/share-offsite/?${query({ url: link })}`,
  facebook: (_text, link) => `https://www.facebook.com/sharer/sharer.php?${query({ u: link })}`,
  threads: (text, link) => `https://www.threads.net/intent/post?${query({ text: withLink(text, link) })}`,
  bluesky: (text, link) => `https://bsky.app/intent/compose?${query({ text: withLink(text, link) })}`,
}

/** Whether the network has no field for the text: it is copied instead, to paste. */
export const takesText = (place: string) => ['x', 'threads', 'bluesky'].includes(place)
