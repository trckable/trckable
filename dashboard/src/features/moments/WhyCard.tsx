// "Here's why": the card a marker opens, with the numbers and one action. The
// click has already applied its filter; this says what it is. Markers that
// landed together are listed under the numbers, each a button that moves the
// card (and the filter) to it.
import { SideCard } from '../../components/SideCard/SideCard'
import { copy } from './copy'
import { openMark } from './open'
import { PinBody } from './PinBody'
import { say } from './words'

export function WhyCard({ open, money, onShare, onPick }: { open: NonNullable<ReturnType<typeof openMark.get>>; money: (minor: number) => string; onShare?: () => void; onPick: (at: number) => void }) {
  const said = say(open.pins[open.at], money)
  const close = () => openMark.set(null)
  return (
    <SideCard
      id="moment-why"
      asked
      label={said.title}
      closeLabel={copy.close}
      title={said.title}
      onClose={close}
      actions={
        onShare ? (
          <button type="button" className="btn primary" onClick={onShare}>
            {copy.share}
          </button>
        ) : (
          <button type="button" className="btn" onClick={close}>
            {copy.close}
          </button>
        )
      }
    >
      <PinBody said={said} />
      {open.pins.length > 1 && (
        <ul className="why-more">
          {open.pins.map((q, k) =>
            k === open.at ? null : (
              <li key={q.id}>
                <button type="button" onClick={() => onPick(k)}>
                  {say(q, money).line}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </SideCard>
  )
}
