// Puts the Features pop-up on the page: its own root, so the first load holds
// only the call that fetches this file. It finds the site on screen and who is
// signed in itself, then draws the pop-up and takes it away when it closes.
import { createRoot, type Root } from 'react-dom/client'
import { api } from '../../lib/api'
import { siteForSegment } from '../../lib/siteRoute'
import FeaturesDialog from './FeaturesDialog'

let root: Root | null = null

export default async function show() {
  if (root) return
  const host = document.createElement('div')
  root = createRoot(host)
  document.body.append(host)
  const close = () => {
    root?.unmount()
    host.remove()
    root = null
  }
  try {
    const [{ sites }, me] = await Promise.all([api.sites(), api.profile()])
    const site = siteForSegment(sites, location.pathname.slice(1)) ?? sites[0] ?? null
    root.render(<FeaturesDialog site={site} user={me.email} onClose={close} />)
  } catch {
    close()
  }
}
