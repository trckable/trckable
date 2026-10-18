// Where Peek's row goes in ⌘K: first when the text reads as a question or a request, last otherwise, so asking is
// always one arrow away. One pure rule for all six languages.
export type AskPlace = 'first' | 'last' | 'none'

const set = (s: string) => new Set(s.split(/\s+/))

const questions = set(
  'why how what when which who where whose did is are does do can could should will would ' +
    'warum wieso weshalb wie was wann welche welcher welches welchen wer wo woher wohin wieviel ist sind kann gibt hat ' +
    'pourquoi comment quoi quand quel quelle quels quelles qui ou combien est sont peut ' +
    'por que como cual cuales cuando quien quienes donde cuanto cuantos cuantas es son puede ' +
    'perche come cosa che quale quali chi dove quanto quanti quante sono puo ' +
    'waarom hoe wat wanneer welke wie waar hoeveel zijn kan',
)

const requests = set(
  'show compare find list explain tell give top best worst most least trend drop spike increase decrease grew fell rise ' +
    'zeige zeig zeigen vergleiche vergleich finde finden liste erklare sag gib beste besten schlechteste meisten wenigsten anstieg einbruch ruckgang ' +
    'montre montrer affiche compare comparer trouve trouver liste expliquer explique dis donne meilleur meilleurs pire plus moins tendance baisse hausse pic augmentation ' +
    'muestra muestrame mostrar compara comparar busca encuentra lista explica dime dame mejor mejores peor mas menos tendencia caida subida aumento ' +
    'mostra mostrami confronta confrontare trova cerca elenca spiega dimmi dammi migliore migliori peggiore piu meno tendenza calo picco ' +
    'toon laat vergelijk vind zoek lijst leg vertel geef slechtste meeste minste daling piek stijging',
)

const metrics = set(
  'visitors visitor sales revenue bounce rate views pageviews traffic sessions signups conversions clicks orders ' +
    'besucher umsatz verkaufe absprungrate aufrufe seitenaufrufe sitzungen ' +
    'visiteurs ventes revenu rebond vues trafic taux ' +
    'visitantes ventas ingresos rebote visitas trafico tasa ' +
    'visitatori vendite ricavi rimbalzo visualizzazioni traffico tasso ' +
    'bezoekers verkoop omzet bouncepercentage weergaven verkeer',
)

const dates = set(
  'today yesterday week month year last this days heute gestern woche monat jahr letzte letzten diese tage ' +
    'hui hier semaine mois annee dernier derniere ce ' +
    'hoy ayer semana mes ano ultimo ultima ' +
    'oggi ieri settimana mese anno scorso ' +
    'vandaag gisteren maand jaar laatste vorige ' +
    'january february march april may june july august september october november december ' +
    'januar februar marz mai juni juli oktober dezember ' +
    'janvier fevrier mars avril juin juillet aout septembre novembre decembre ' +
    'enero febrero marzo abril mayo junio julio agosto setiembre diciembre ' +
    'gennaio febbraio maggio giugno luglio settembre ottobre dicembre ' +
    'januari februari maart mei augustus',
)

/** Lower case, no accents (ä is a, ß is ss), single spaces. */
export const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * @param found how many rows the text finds among the jumps
 * @param exact the text is one word that is exactly a table, site or filter
 */
export function askIntent(text: string, found: number, exact: boolean): AskPlace {
  const t = plain(text)
  if (!t) return 'none'
  if (/[?¿]/.test(t)) return 'first'
  if (exact && !t.includes(' ')) return 'last'
  // A site name or a filter ("albas.al", "country:de") is a jump, whatever it is made of.
  if (!t.includes(' ') && /[.:]/.test(t)) return 'last'
  const words = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length >= 2) {
    if (questions.has(words[0]) || (words[0] === 'por' && words[1] === 'que')) return 'first'
    if (words.some((w) => requests.has(w))) return 'first'
    if (words.some((w) => metrics.has(w)) && words.some((w) => dates.has(w) || /^\d/.test(w))) return 'first'
  }
  if (words.length >= 4 && found === 0) return 'first'
  return 'last'
}
