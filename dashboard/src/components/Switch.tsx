// A switch, with a name a screen reader can read out. It takes that name from
// the Row it sits in, so it can never be forgotten: a switch with no label
// announces itself as "switch, on" and tells nobody what it switches.
import { createContext, useContext } from 'react'

/** The label of the surrounding Row, for controls that need a name. */
export const RowLabel = createContext('')

export function Switch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean
  /** Only needed outside a Row; inside one the row's own label is used. */
  label?: string
  disabled?: boolean
  onChange: () => void
}) {
  const from = useContext(RowLabel)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label || from || undefined}
      disabled={disabled}
      className={on ? 'switch on' : 'switch'}
      onClick={onChange}
    >
      <span />
    </button>
  )
}
