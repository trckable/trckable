// Every dialog ends the same way, so nobody has to work out where to look.
//
//   left      the quiet way out — Cancel, Done, Back — a ghost button
//   children  the one thing you probably came to do: exactly one primary
//
// Both sit at the bottom right, on one row, with no band or rule of their own:
// the dialog's padding is the only space around them. On a phone the primary
// takes the width the quiet button leaves, where a thumb reaches.
import type { ReactNode } from 'react'
import './DialogActions.css'

export function DialogActions({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <div className="dialog-actions">
      {left}
      {children}
    </div>
  )
}
