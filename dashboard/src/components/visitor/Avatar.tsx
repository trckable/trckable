// A visitor's generated face: a soft gradient in a colour that comes from
// their id, with the id's first two characters. The same person always looks
// the same, in the live list and in their journey.
import { hueOf } from '../../lib/visitor'
import './visitor.css'

export function Avatar({ id, size = 40, live = false }: { id: string; size?: number; live?: boolean }) {
  const hue = hueOf(id)
  const cls = live ? 'v-avatar live' : 'v-avatar'
  return (
    <span className={cls} style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ['--v-hue' as string]: String(hue) }} aria-hidden="true">
      {id.slice(0, 2).toUpperCase()}
    </span>
  )
}
