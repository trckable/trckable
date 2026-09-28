// Name the view you are looking at, to come back to it (Dashboard's saved views).
import { useState } from 'react'
import { DialogActions } from './DialogActions'
import { Modal } from './Modal'

/** "no filters", "the filter", "all 3 filters". */
function filtersWords(n: number) {
  if (n === 0) return 'no filters'
  return n === 1 ? 'the filter' : `all ${n} filters`
}

/** Name the view you are looking at. It says what will be kept — the range,
 *  the filters, the mode — so nobody saves one thing expecting another. */
export function SaveViewDialog({ filters, onClose, onSave }: { filters: number; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal label="Save this view" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          setBusy(true)
          onSave(n)
        }}
      >
        <h2>Save this view</h2>
        <p className="muted" style={{ margin: 0 }}>
          The date range, {filtersWords(filters)}, and Core or Full — one click to come back to it, from
          the Filter menu or the row under the date picker.
        </p>
        <input
          className="input"
          style={{ height: 46 }}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Search traffic, this month"
          aria-label="Name of the saved view"
          autoFocus
        />
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save view'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
