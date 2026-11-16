// The words of a shared link's period switch: short, so three fit beside each other on a phone.
import { defineCopy } from '../../i18n'

const short: Record<string, string> = { '7d': '7d', '30d': '30d', '12mo': '12mo' }

export const copy = defineCopy('sharePeriod', { label: 'Period', refresh: 'Refresh', short })
