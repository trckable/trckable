// The replay cut: everything right of it is greyed out, the left stays lit.
// The pointer moves it every frame by writing one CSS variable (the paths are
// drawn once and masked, never redrawn); keys, touch and Replay move it to a
// bucket.
import { useLayoutEffect, useRef, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from 'react'

interface CutArgs {
  ref: RefObject<HTMLDivElement | null>
  w: number
  n: number
  hover: number | null
  scrub: number | null
  setHover: Dispatch<SetStateAction<number | null>>
  x: (i: number) => number
}

export function useCut({ ref, w, n, hover, scrub, setHover, x }: CutArgs) {
  // Where the pointer is, and the bucket it picked: the cut sits at the
  // pointer itself only while that bucket is the one being shown.
  const pointerRef = useRef<{ px: number; i: number } | null>(null)
  const cutAt = (): number | null => {
    const at = pointerRef.current
    if (at && at.i === hover) return at.px
    if (hover != null) return x(hover)
    if (scrub != null && n > 1) return x(scrub)
    return null
  }
  const setCut = (cx: number | null) => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--cut', `${cx ?? w + 8}px`)
    if (cx == null) {
      el.dataset.cut = 'off'
      return
    }
    // Coming in from outside, the cut appears where it is instead of
    // gliding across from the edge; after that it glides.
    if (el.dataset.cut !== 'on') {
      el.dataset.cut = 'jump'
      el.getBoundingClientRect() // commit the jump before the glide is switched back on
    }
    el.dataset.cut = 'on'
  }
  useLayoutEffect(() => setCut(cutAt()))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!n) return
    if (e.key === 'Escape') {
      setHover(null)
      return
    }
    const moves: Record<string, (from: number | null) => number> = {
      ArrowRight: (from) => Math.min(n - 1, from == null ? 0 : from + 1),
      ArrowLeft: (from) => Math.max(0, from == null ? n - 1 : from - 1),
      Home: () => 0,
      End: () => n - 1,
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    pointerRef.current = null
    setHover((c) => move(c ?? scrub))
  }
  /** The pointer moved: the cut goes there this frame, without a render. */
  const follow = (px: number, i: number) => {
    const at = { px: Math.max(x(0), Math.min(x(n - 1), px)), i }
    pointerRef.current = at
    setCut(at.px)
  }
  const release = () => {
    pointerRef.current = null
  }
  return { follow, release, onKey }
}
