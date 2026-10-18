// The clock of a replay: how far the line has been drawn, from 0 to 1, -1 when nothing plays. The run (run.ts) only
// writes the number here; the chart and the stage read it and move themselves straight on their elements, so a frame
// never re-renders the page.

let pos = -1
const subs = new Set<() => void>()

export const reveal = {
  get: () => pos,
  set(p: number) {
    pos = p
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}
