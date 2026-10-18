import { describe, expect, it } from 'vitest'
import { askIntent, plain } from '../explore/askIntent'

const first = [
  'why did traffic drop?', 'Which pages are slow', 'traffic today?', 'does it work', 'can I export this',
  'Warum sind die Besucher gesunken', 'Wie viele Besucher gestern', 'Was ist meine Absprungrate', 'wer hat gekauft', 'zeige die besten Seiten',
  'Pourquoi le trafic baisse', 'Comment augmenter les ventes', 'quelles pages sont lentes', 'montre les meilleurs pays', 'où sont mes visiteurs',
  'Por qué bajaron las visitas', '¿cuántas ventas hoy', 'cómo subo el tráfico', 'muestra las mejores páginas', 'cuál es la tasa de rebote',
  'Perché il traffico è calato', 'come aumentare le vendite', 'quali pagine sono lente', 'mostra le pagine migliori', 'confronta questa settimana',
  'Waarom daalt het verkeer', 'hoe veel bezoekers vandaag', 'welke pagina is het traagst', 'toon de beste landen', 'vergelijk deze maand',
  'visitors last week', 'sales yesterday', 'bounce rate march', 'Besucher letzte Woche', 'ventes hier', 'visitas ayer', 'visitatori oggi', 'bezoekers gisteren',
  'revenue 30 days', 'one two three four',
  'top pages', 'spike in signups',
]
const last = [
  'pages', 'albas.al', 'country:de', 'Pages ', 'how', 'why', 'visitors', 'germany', 'Seiten', 'páginas', 'pagine', 'bezoekers',
  'last 7 days', 'two words', 'a b c',
]

describe('where the Ask row goes', () => {
  it.each(first)('leads for %s', (q) => expect(askIntent(q, 0, false)).toBe('first'))
  it.each(first.filter((q) => q.includes('?')))('leads for a question mark even if rows match: %s', (q) => expect(askIntent(q, 5, false)).toBe('first'))
  it.each(last)('follows for %s', (q) => expect(askIntent(q, 1, false)).toBe('last'))
  it('is always one row away for words that match nothing', () => {
    expect(askIntent('xyz', 0, false)).toBe('last')
    expect(askIntent('foo bar baz', 0, false)).toBe('last')
  })
  it('leads for four words that match nothing, not for four that match', () => {
    expect(askIntent('foo bar baz qux', 0, false)).toBe('first')
    expect(askIntent('foo bar baz qux', 2, false)).toBe('last')
  })
  it('keeps a one-word exact match first', () => {
    expect(askIntent('pages', 3, true)).toBe('last')
    expect(askIntent('top', 3, true)).toBe('last')
  })
  it('has no row for empty text', () => {
    expect(askIntent('', 0, false)).toBe('none')
    expect(askIntent('   ', 0, false)).toBe('none')
  })
  it('ignores case, accents and trailing spaces', () => {
    expect(plain('  PÓR Qué  ')).toBe('por que')
    expect(askIntent('PERCHÉ  il traffico ', 0, false)).toBe('first')
    expect(askIntent('Straße', 0, false)).toBe('last')
  })
})
