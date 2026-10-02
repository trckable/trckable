// Settings → Notes: the same list as the chart's, as a section. A click on a
// note closes Settings and shows its day on the dashboard under them.
import type { Site } from '../../lib/api'
import { closeSettings } from '../../lib/settings'
import { openCreate } from '../create/openCreate'
import { askJump } from './jump'
import { NotesPanel } from './NotesList'

export function NotesSettings({ site }: { site: Site }) {
  return (
    <section className="card" style={{ gap: 12 }}>
      <NotesPanel
        site={site}
        onAdd={() => {
          closeSettings()
          openCreate()
        }}
        onJump={(day) => {
          closeSettings()
          askJump(day)
        }}
      />
    </section>
  )
}
