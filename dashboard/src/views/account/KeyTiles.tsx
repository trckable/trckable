// Where the keys are for, as three small tiles: no sentences.
import { Bot, ExternalLink, SquareTerminal, Webhook } from 'lucide-react'
import { keys as t } from './keysCopy'

export function KeyTiles() {
  return (
    <div className="key-tiles">
      <a className="key-tile" href={t.docs} target="_blank" rel="noreferrer">
        <span className="icon-tile small accent">
          <Bot size={15} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {t.tiles.ai}
        <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
      </a>
      <span className="key-tile">
        <span className="icon-tile small">
          <Webhook size={15} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {t.tiles.api}
      </span>
      <span className="key-tile">
        <span className="icon-tile small">
          <SquareTerminal size={15} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {t.tiles.scripts}
      </span>
    </div>
  )
}
