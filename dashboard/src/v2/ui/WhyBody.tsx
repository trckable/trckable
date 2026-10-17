// The text of a "Why?" (the cause and what to do), and under it, where the build has Peek, one action: Ask Peek, with the question and its numbers ready.
import { copy as top } from '../copy'
import { useV2Extras } from '../slots'
import { copy as asks } from '../briefing/why.copy'
import { copy } from '../briefing/copy'
import type { Why } from '../briefing/why'

export function WhyBody({ why }: { why: Why }) {
  const { askPeek } = useV2Extras()
  return (
    <>
      <b>{copy.whyDot}</b> {why.cause} {why.todo && <span className="ev">{why.todo}</span>}
      {askPeek && (
        <div style={{ marginTop: 'var(--mk-s2)' }}>
          <button type="button" className="gh" data-ask-peek="1" onClick={() => askPeek(asks.askWhy(why.cause))}>
            {top.askPeek}
          </button>
        </div>
      )}
    </>
  )
}
