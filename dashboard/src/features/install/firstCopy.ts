// The first screen's two actions. Every word, in one place, with the rest of
// the install flow's: this is what moves to the message files.
import { MIGRATE_DOCS } from './snippet'

export const first = {
  label: 'First steps',
  import: 'Import your history',
  weekly: 'Weekly email',
  weeklyOff: 'Turn on the weekly email',
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
