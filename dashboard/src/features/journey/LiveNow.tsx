// A visitor on the site right now: a pulsing line with the page they are on.
import { truncateMiddle } from '../../lib/visitor'
import { copy } from './copy'

export function LiveNow({ path }: { path: string }) {
  return (
    <p className="jr-live" role="status">
      <span className="jr-live-dot" aria-hidden="true" />
      <b>{copy.onSiteNow}</b>
      {path && (
        <>
          <span className="faint">{copy.viewing}</span>
          <span className="jr-path num" title={path}>
            {truncateMiddle(path, 36)}
          </span>
        </>
      )}
    </p>
  )
}
