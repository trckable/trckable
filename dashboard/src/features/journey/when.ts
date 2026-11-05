import { tag } from '../../i18n'
import { dateFmt } from '../../lib/format'

// Dates and times in the journey, in the reader's own locale: it decides 12
// or 24 hours. Formatters are made once; each is a costly object.
// `zone` is the site's time zone, where the times are the site's (the viewer's own when none is given).
const time = (zone?: string) => dateFmt(tag, { hour: 'numeric', minute: '2-digit', timeZone: zone || undefined })
const day = (zone?: string) => dateFmt(tag, { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone || undefined })
const dayTime = (zone?: string) => dateFmt(tag, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone || undefined })
const dayYear = (zone?: string) => dateFmt(tag, { month: 'short', day: 'numeric', year: 'numeric', timeZone: zone || undefined })

export const fmtTime = (ms: number, zone?: string) => time(zone).format(ms)
export const fmtDayShort = (ms: number, zone?: string) => day(zone).format(ms)
export const fmtDayTime = (ms: number, zone?: string) => dayTime(zone).format(ms)
export const fmtDate = (ms: number, zone?: string) => dayYear(zone).format(ms)
export const isoOf = (ms: number) => new Date(ms).toISOString()
