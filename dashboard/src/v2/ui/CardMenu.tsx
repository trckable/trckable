// The "⋯" at the end of a card's buttons: what is not the card's one action (Watch, Go deeper), in the menu the toolbar uses.
import './cardMenu.css'
import { useMenu } from './useMenu'
import { XMenu, XMi } from './XMenu'
import { copy as cardCopy } from '../briefing/cards.copy'

export interface CardMenuItem {
  key: string
  label: string
  onClick: () => void
  /** The hook a test finds the line by (data-watch, data-deeper). */
  hook: string
}

export function CardMenu({ id, items }: { id: string; items: CardMenuItem[] }) {
  const { open, attach, toggle, close } = useMenu()
  return (
    <div ref={attach} className="cardmenu">
      <XMenu
        id={`card-${id}`}
        open={open}
        label={cardCopy.menuLabel}
        button={
          <button type="button" className="gh more" aria-haspopup="menu" aria-expanded={open} aria-label={cardCopy.menuLabel} title={cardCopy.menuLabel} onClick={toggle}>
            {'\u22EF'}
          </button>
        }
      >
        {items.map((it) => (
          <XMi
            key={it.key}
            name={it.label}
            data={{ [it.hook]: '1' }}
            onClick={() => {
              close()
              it.onClick()
            }}
          />
        ))}
      </XMenu>
    </div>
  )
}
