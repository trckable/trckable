// What the Briefing opens over itself: a card in full, the notes of the site, tomorrow's email as it will read, and
// the dialog that adds a note.
import { lazy, Suspense } from 'react'
import type { Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { useNotes } from '../../features/notes/useNotes'
import { Detail } from '../ui/DetailSheet'
import { MailSheet, NotesSheet } from '../ui/BriefingSheets'
import type { Kc } from '../ui/KpiCard'
import type { CardCtx } from '../ui/StoryCard'
import type { Story } from './cards'
import type { useBriefingState } from './useBriefingState'

const NoteDialog = lazy(() => import('../../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))

interface OverlaysProps {
  ui: ReturnType<typeof useBriefingState>
  site: Site
  range: Range
  today: string
  notes: ReturnType<typeof useNotes>
  ctx: CardCtx
  headline: string
  kcs: Kc[]
  shown: Story[]
  canNote: boolean
}

export function Overlays({ ui, site, range, today, notes, ctx, headline, kcs, shown, canNote }: OverlaysProps) {
  return (
    <>
      {ui.open && <Detail s={ui.open} site={site.domain} c={ctx} onClose={() => ui.setOpen(null)} />}
      {ui.sheet === 'notes' && <NotesSheet site={site.domain} notes={notes.notes} onClose={() => ui.setSheet(null)} onAdd={canNote ? () => ui.setAddNote(true) : undefined} />}
      {ui.sheet === 'mail' && (
        <MailSheet
          site={site.domain}
          headline={headline}
          facts={kcs.map((k) => ({ n: k.val, u: k.label.toLowerCase(), t: k.note.t }))}
          claims={shown.slice(0, 3).map((s) => `${s.head}${s.rest ?? ''}`)}
          onClose={() => ui.setSheet(null)}
        />
      )}
      {ui.addNote && (
        <Suspense fallback={null}>
          <NoteDialog
            site={site}
            day={range.to}
            today={today}
            days={[]}
            notes={notes.notes}
            onClose={() => ui.setAddNote(false)}
            onSaved={() => {
              ui.setAddNote(false)
              notes.load()
            }}
          />
        </Suspense>
      )}
    </>
  )
}
