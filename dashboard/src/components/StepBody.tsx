// The body of a dialog that moves through steps. It never shrinks from one
// step to the next and grows smoothly when a step needs more room, so the
// dialog does not jump about while someone is reading it. Each step is keyed,
// so it slides in fresh.
import { useLayoutEffect, useRef, useState } from 'react'
import './Steps.css'

export function StepBody({ step, className, children }: { step: string | number; className?: string; children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [min, setMin] = useState(0)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const grow = () => setMin((m) => Math.max(m, el.offsetHeight))
    grow()
    const ro = new ResizeObserver(grow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [step])
  return (
    <div className="step-body" style={{ minHeight: min || undefined }}>
      <div ref={inner} key={step} className={'step-inner' + (className ? ' ' + className : '')}>
        {children}
      </div>
    </div>
  )
}
