// What the lists compare themselves with: this period's report and the one
// before it, handed over by the dashboard each render. The new lists read it,
// so no list has to be told. (Try-out.)
import type { Result } from '../../lib/api'

let current: Result | undefined
let previous: Result | undefined

export const setBasis = (now: Result | undefined, before: Result | undefined) => {
  current = now
  previous = before
}

export const basis = () => ({ current, previous })
