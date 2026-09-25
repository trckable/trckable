// A button for what cannot be undone: it acts only after it has been held
// down for a moment, and shows that moment filling up. A slip of the finger
// or a stray Enter can never delete anything. Keyboard: hold Space or Enter.
import { useEffect, useRef, useState } from 'react'
import './HoldButton.css'

export function HoldButton({ onDone, children, ms = 1600, disabled }: { onDone: () => void; children: React.ReactNode; ms?: number; disabled?: boolean }) {
  const [held, setHeld] = useState(0) // 0..1
  const start = useRef<number | null>(null)
  const raf = useRef(0)
  const fired = useRef(false)

  const stop = () => {
    cancelAnimationFrame(raf.current)
    start.current = null
    if (!fired.current) setHeld(0)
  }
  const begin = () => {
    if (disabled || fired.current) return
    start.current = performance.now()
    const tick = (now: number) => {
      if (start.current == null) return
      const p = Math.min(1, (now - start.current) / ms)
      setHeld(p)
      if (p >= 1) {
        fired.current = true
        onDone()
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <button
      type="button"
      className="btn danger big hold"
      disabled={disabled}
      aria-label={`${typeof children === 'string' ? children : 'Confirm'} — hold to confirm`}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), begin())}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      style={{ ['--held' as string]: held }}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-text">{held > 0 && held < 1 ? 'Keep holding…' : children}</span>
    </button>
  )
}
