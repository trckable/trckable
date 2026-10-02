// The first screen's two side cards and the import dialog. Every word, in one
// place, with the rest of the install flow's: this is what moves to the message files.
import { MIGRATE_DOCS } from './snippet'

export const first = {
  cards: {
    close: 'Close',
    import: { label: 'Import your history', title: 'Import your history', body: 'From GA4 or a CSV.', go: 'Import' },
    weekly: { label: 'Weekly email', title: 'Turn on the weekly email', body: 'The week’s numbers, in your inbox.', go: 'Turn on' },
  },
  weeklyOn: 'Weekly email: on',
  weeklyStopped: 'Weekly email: off',
  importDialog: {
    title: 'Import your history',
    ga4: 'GA4',
    ga4Sub: 'BigQuery export, NDJSON',
    csv: 'CSV',
    csvSub: 'ts, path, visitor',
    command: (domain: string) => `trckabled import ${domain} export.ndjson`,
    docs: 'Docs',
    docsUrl: MIGRATE_DOCS,
    close: 'Close',
  },
}
