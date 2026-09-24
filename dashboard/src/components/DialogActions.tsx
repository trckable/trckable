// Every dialog ends the same way, so nobody has to work out where to look.
//
//   left   the way out — Cancel, Later, Back. Quiet, and always on the left.
//   right  the one thing you probably came to do. Exactly one primary.
//
// The bar reaches the dialog's edges and sits under a hairline, so it reads as
// a footer rather than as two more buttons in the content. On a phone the
// primary takes the top line at full width, because that is where a thumb is.
import type { ReactNode } from 'react'

export function DialogActions({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <div className="dialog-actions">
      {left}
      <span className="dialog-actions-gap" />
      {children}
    </div>
  )
}
