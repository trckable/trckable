// The link as a QR code, drawn in the page: a link is a secret, so it never
// goes to an image service. The encoder is fetched when this first opens.
import { useEffect, useState } from 'react'
import { copy } from './copy'

/** Always black on white: scanners struggle with an inverted code. */
export function QrCode({ text }: { text: string }) {
  const [shape, setShape] = useState<{ n: number; d: string } | null>(null)
  useEffect(() => {
    let gone = false
    import('../../lib/qr')
      .then((m) => {
        const grid = m.qr(text)
        if (!gone) setShape({ n: grid.length, d: m.qrPath(grid) })
      })
      .catch(() => undefined)
    return () => {
      gone = true
    }
  }, [text])
  if (!shape) return null
  return (
    <svg className="sl-qr" viewBox={`-3 -3 ${shape.n + 6} ${shape.n + 6}`} role="img" aria-label={copy.qrLabel} shapeRendering="crispEdges">
      <rect x={-3} y={-3} width={shape.n + 6} height={shape.n + 6} fill="#fff" />
      <path d={shape.d} fill="#000" />
    </svg>
  )
}
