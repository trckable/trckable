// What a moment's card tells a listener when it is asked about: what it is,
// the figure, the line the card says and the day. Plain text from the card.
import type { AboutThis } from '../../components/Ask'
import { copy } from './copy'
import type { Figure } from './figure'
import type { Said } from './words'

export function aboutPin(said: Pick<Said, 'title' | 'line'>, fig: Figure, when?: { text: string; title: string }): AboutThis {
  const figure = fig.n !== undefined && fig.fmt ? fig.fmt(fig.n) : (fig.text ?? '')
  const facts = [[figure, fig.unit].filter(Boolean).join(' '), said.line, when?.title].filter((f): f is string => !!f)
  return { title: said.title, facts, question: copy.ask(said.title) }
}
