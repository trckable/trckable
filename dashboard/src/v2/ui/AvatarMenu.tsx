// The person's menu: who is signed in, what belongs to them, and the way out.
import type { ReactNode } from 'react'
import { useMenu } from './useMenu'

export interface AvatarItem {
  key: string
  name: ReactNode
  d?: ReactNode
  run: () => void
  /** A line above it. */
  line?: boolean
}

export function AvatarMenu({ initial, who, d, items }: { initial: string; who: string; d: string; items: AvatarItem[] }) {
  const { open, attach, toggle, close } = useMenu()
  return (
    <div className="acctw" ref={attach}>
      <button type="button" className="av" aria-haspopup="menu" aria-expanded={open} aria-label="Account" data-key="user" onClick={toggle}>
        {initial}
      </button>
      <div className={`menu amenu${open ? ' on' : ''}`} id="acctMenu">
        {open && (
          <>
            <div className="who">
              <span className="av">{initial}</span>
              <span className="mt2">
                <div className="nm">{who}</div>
                <div className="d">{d}</div>
              </span>
            </div>
            {items.map((i) => (
              <div key={i.key}>
                {i.line && <div className="lline" />}
                <button
                  type="button"
                  className="mi"
                  onClick={() => {
                    close()
                    i.run()
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
