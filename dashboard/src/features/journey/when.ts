// Dates and times in the journey, in the reader's own locale: it decides 12
// or 24 hours. Formatters are made once; each is a costly object.
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const dayTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const dayYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export const fmtTime = (ms: number) => time.format(ms)
export const fmtDayShort = (ms: number) => day.format(ms)
export const fmtDayTime = (ms: number) => dayTime.format(ms)
export const fmtDate = (ms: number) => dayYear.format(ms)
export const isoOf = (ms: number) => new Date(ms).toISOString()
