// The small tag after a device's icon when the visit opened in an app: the social app's name, or "App".
import { appTag } from './copy'
import './appTag.css'

export function AppTag({ app }: { app: string }) {
  return <em className="app-tag">{appTag(app)}</em>
}
