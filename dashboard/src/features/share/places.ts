// Where a card goes: each place offers only its own sizes (ids of formats.json, the list the server draws by), and
// says how it opens: a network's own composer with the post and the link, or nothing but the file or the link.
import type { Shape } from './card'

export type Place = 'linkedin' | 'x' | 'instagram' | 'threads' | 'facebook' | 'bluesky' | 'download' | 'email'
/** The names of the sizes, in the message files. */
export type SizeName = 'wide' | 'square' | 'post' | 'story' | 'preview' | 'pngWide' | 'pngSquare' | 'pngStory'

export type PlaceInfo = {
  id: Place
  /** The first of a place's sizes is the one it opens on. */
  sizes: { shape: Shape; name: SizeName }[]
  /** Offered up front; the others are under "More places". */
  main?: boolean
  /** A network with a post to write (the text box shows; the others have no text). */
  social: boolean
}

export const PLACES: PlaceInfo[] = [
  { id: 'linkedin', main: true, social: true, sizes: [{ shape: 'post', name: 'post' }, { shape: 'square', name: 'square' }] },
  { id: 'x', main: true, social: true, sizes: [{ shape: 'wide', name: 'wide' }, { shape: 'square', name: 'square' }] },
  { id: 'instagram', social: true, sizes: [{ shape: 'portrait', name: 'post' }, { shape: 'story', name: 'story' }, { shape: 'square', name: 'square' }] },
  { id: 'threads', social: true, sizes: [{ shape: 'portrait', name: 'post' }, { shape: 'square', name: 'square' }] },
  { id: 'facebook', social: true, sizes: [{ shape: 'link', name: 'post' }, { shape: 'square', name: 'square' }] },
  { id: 'bluesky', social: true, sizes: [{ shape: 'wide', name: 'wide' }, { shape: 'square', name: 'square' }] },
  { id: 'download', social: false, sizes: [{ shape: 'wide', name: 'pngWide' }, { shape: 'square', name: 'pngSquare' }, { shape: 'story', name: 'pngStory' }] },
  { id: 'email', social: false, sizes: [{ shape: 'link', name: 'preview' }] },
]
export const placeOf = (id: Place) => PLACES.find((p) => p.id === id) ?? PLACES[0]
export const MAIN_PLACES = PLACES.filter((p) => p.main)
export const MORE_PLACES = PLACES.filter((p) => !p.main)

/** The place's own sizes, and the one at `i` (the first when there is no such). */
export const sizeAt = (place: Place, i: number) => {
  const sizes = placeOf(place).sizes
  return sizes[Math.min(i, sizes.length - 1)]
}
