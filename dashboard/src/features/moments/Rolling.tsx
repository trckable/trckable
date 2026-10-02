// A number that counts up to where it is, in about 0.7 s (at once with reduced
// motion): the card's figure arriving, not appearing.
import { useTween } from '../../lib/motion'

export function Rolling({ to, fmt }: { to: number; fmt: (n: number) => string }) {
  return <>{fmt(Math.round(useTween(to, 700)))}</>
}
