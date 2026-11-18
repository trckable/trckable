// The canvas of the setup screen's backdrop; setupGlobe.ts draws it. Loaded on its own, after the first paint.
import { useEffect, useRef } from 'react'
import { startGlobe } from './globeDraw'

export default function SetupGlobe({ avoid }: { avoid: string }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const h = host.current
    const c = canvas.current
    return h && c ? startGlobe(h, c, avoid) : undefined
  }, [avoid])
  return (
    <div className="sb-host" ref={host}>
      <canvas ref={canvas} />
    </div>
  )
}
