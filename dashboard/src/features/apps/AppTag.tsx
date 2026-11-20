// The small tag after a device's icon when the visit opened in an app: "iOS app", "Android app", or the social app's name.
import { howKey, howName } from './copy'
import './appTag.css'

export function AppTag({ app, device, os }: { app: string; device?: string; os?: string }) {
  return <em className="app-tag">{howName(howKey({ app, device, os }))}</em>
}
