// What a side card has already said to someone about one site: acted on or put
// away, it does not come back. Kept in this browser (there is no setting on the
// server for it); a browser that will not store it just shows the card again
// next time, and never throws.
import { useState } from 'react'

const key = (card: string, site: string) => `trckable:card:${card}:${site}`

export function wasSeen(card: string, site: string): boolean {
  try {
    return localStorage.getItem(key(card, site)) === '1'
  } catch {
    return false
  }
}

export function markSeen(card: string, site: string) {
  try {
    localStorage.setItem(key(card, site), '1')
  } catch {
    /* private mode: the card is put away for this page only */
  }
}

/** Whether the card is already put away, and the way to put it away. */
export function useSeen(card: string, site: string): [boolean, () => void] {
  const [gone, setGone] = useState(false)
  const done = () => {
    markSeen(card, site)
    setGone(true)
  }
  return [gone || wasSeen(card, site), done]
}
