// The person's menu: who is signed in, what belongs to them, and the way out. A row can open a short list in place
// (the language, the theme) with a way back. Markup and classes are the walkthrough's own.
import { useState, type ReactNode } from 'react'
import { useMenu } from './useMenu'

export interface AvatarItem {
  key: string
  name: ReactNode
  d?: ReactNode
  run?: () => void
  /** A line above it. */
  line?: boolean
  /** A list that opens in place of the menu when the row is pressed. */
  panel?: { title: string; rows: { key: string; name: string; on: boolean; run: () => void }[] }
}

export function AvatarMenu({ initial, who, d, items, back, extras }: { initial: string; who: string; d: string; items: AvatarItem[]; back: string; extras?: ReactNode }) {
  const { open, attach, toggle, close } = useMenu()
  const [sub, setSub] = useState<string | null>(null)
  const panel = items.find((i) => i.key === sub)?.panel
  const shut = () => {
    close()
    setSub(null)
  }
  return (
    <div className="acctw" ref={attach} style={{ position: 'relative' }}>
      <button
        type="button"
        className="av"
        id="avBtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        data-key="user"
        onClick={() => {
          if (open) shut()
          else toggle()
        }}
      >
        {initial}
      </button>
      <div className={`mk-menu amenu${open ? ' on' : ''}`} id="acctMenu">
        {open && panel && (
          <>
            <button type="button" className="mi" onClick={() => setSub(null)}>
              <span className="mt2">
                <div className="nm">{`‹ ${back}`}</div>
              </span>
            </button>
            <div className="mk-lline" />
            {panel.rows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`mi${r.on ? ' on' : ''}`}
                onClick={() => {
                  r.run()
                  shut()
                }}
              >
                <span className="mt2">
                  <div className="nm">{r.name}</div>
                </span>
              </button>
            ))}
          </>
        )}
        {open && !panel && (
          <>
            <div className="who">
              <span className="av">{initial}</span>
              <span className="mt2">
                <div className="nm">{who}</div>
                <div className="d">{d}</div>
              </span>
            </div>
            {extras}
            {items.map((i) => (
              <div key={i.key} style={{ display: 'contents' }}>
                {i.line && <div className="mk-lline" />}
                <button
                  type="button"
                  className="mi"
                  onClick={() => {
                    if (i.panel) {
                      setSub(i.key)
                      return
                    }
                    shut()
                    i.run?.()
                  }}
                >
                  <span className="mt2">
                    <div className="nm">{i.name}</div>
                    {i.d && <div className="d">{i.d}</div>}
                  </span>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
