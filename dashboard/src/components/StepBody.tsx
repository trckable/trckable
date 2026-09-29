// The body of a dialog that moves through steps. It never shrinks from one
// step to the next and grows smoothly when a step needs more room, so the
// dialog does not jump about while someone is reading it (or, with fit, it is
// as tall as the step and follows it). Each step is keyed, so it slides in fresh.
import { useLayoutEffect, useRef, useState } from 'react'
import './Steps.css'

/** fit: the body is exactly as tall as the step, and follows it (a step that
 *  loads more, a step change) with a short transition; it never holds a floor. */
export function StepBody({ step, className, fit, children }: { step: string | number; className?: string; fit?: boolean; children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [min, setMin] = useState(0)
  const [height, setHeight] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const grow = () => (fit ? setHeight(el.offsetHeight) : setMin((m) => Math.max(m, el.offsetHeight)))
    grow()
    const ro = new ResizeObserver(grow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [step, fit])
  return (
    <div className={'step-body' + (fit ? ' fit' : '')} style={fit ? { height } : { minHeight: min || undefined }}>
      <div ref={inner} key={step} className={'step-inner' + (className ? ' ' + className : '')}>
        {children}
      </div>
    </div>
  )
}
