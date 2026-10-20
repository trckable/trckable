import { copy as mcopy } from '../mentions/copy'
import { factsOf, safeURL } from '../mentions/model'
import { SourceMark } from '../mentions/SourceMark'
import { copy } from './copy'
import { Frame } from './Frame'
import type { MentionsBlock } from './types'

/** The mentions of a period: where, what it said, who and when, and the visitors it brought. */
export function MentionsList({ b }: { b: MentionsBlock }) {
  const list = b.data.mentions
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      {list.length === 0 ? (
        <p className="blk-sub">{copy.noMentions}</p>
      ) : (
        <ul className="blk-men">
          {list.map((m) => {
            const href = safeURL(m.url)
            const title = m.title || mcopy.name[m.source]
            return (
              <li key={m.id}>
                <SourceMark source={m.source} />
                <span className="blk-men-text">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                  <small>{[mcopy.name[m.source], ...factsOf(m)].join(' · ')}</small>
                </span>
                {m.visitors > 0 && <b>{copy.visitors(m.visitors)}</b>}
              </li>
            )
          })}
        </ul>
      )}
    </Frame>
  )
}
