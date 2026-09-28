// The visitor's actions, tucked into one small menu: copy the id, and — for
// owners and admins, the only people allowed — start a data request or erase
// the visitor. Both open Privacy's request panel with this visitor looked
// up; erasing asks there, with the counts, before anything is deleted.
import { Menu } from '../../components/Menu'
import { toast } from '../../components/Toast'
import type { Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'

async function copyId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    toast(copy.copied)
  } catch {
    toast(copy.copyFailed, 'error')
  }
}

export function JourneyMenu({ site, visitor }: { site: Site; visitor: string }) {
  const request = () => openSettings(site, 'privacy', { visitor })
  return (
    <Menu label={copy.options}>
      {(close) => {
        const item = (label: string, fn: () => void, extra: { title?: string; danger?: boolean } = {}) => (
          <button type="button" role="menuitem" className={extra.danger ? 'danger' : undefined} title={extra.title} onClick={() => { close(); fn() }}>
            {label}
          </button>
        )
        return (
          <>
            {item(copy.copyId, () => void copyId(visitor))}
            {!isViewer() && item(copy.dataRequest, request, { title: copy.dataRequestHint })}
            {!isViewer() && item(copy.erase, request, { danger: true })}
          </>
        )
      }}
    </Menu>
  )
}
