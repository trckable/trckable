// Every word of the Notes list and the share switch: loaded with them, never
// with the first screen (copy.ts has the chart's few).
import { fmtDay } from '../../lib/dates'

const count = (n: number) => (n === 1 ? '1 note' : `${n} notes`)

export const copy = {
  by: (author: string) => `by ${author}`,
  title: 'Notes',
  intro: 'Notes pinned to days on the chart: a launch, a post, an outage. Click one to see its day on the chart.',
  search: 'Search notes',
  loading: 'Loading notes…',
  failed: 'Couldn’t load the notes.',
  empty: 'No notes yet. Add one from the chart: point at a day and press +.',
  noMatch: (q: string) => `No note matches “${q}”.`,
  shown: (n: number, all: number) => (n === all ? count(all) : `${n} of ${count(all)}`),
  jump: (day: string) => `Show ${fmtDay(day, { year: true, weekday: true })} on the chart`,
  edit: 'Edit',
  editLabel: (text: string) => `Edit note: ${text}`,
  remove: 'Delete',
  removeLabel: (text: string) => `Delete note: ${text}`,
  day: 'Day',
  text: 'Note',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saved: 'Note saved',
  removeTitle: 'Delete this note?',
  removeBody: (text: string) => `“${text}” goes from the chart for everyone on the team. It cannot be brought back.`,
  removing: 'Deleting…',
  removed: 'Note deleted',
  close: 'Close',

  // Settings.
  tab: 'Notes',
}
