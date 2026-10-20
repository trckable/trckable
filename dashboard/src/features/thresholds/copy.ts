// The words of the target alert (Settings → Alerts): tell me when sales, revenue or visitors
// reach a number in a day, a week, a month or in total. The rule is read as one line:
// "Tell me at 10 sales in a day".
import { defineCopy } from '../../i18n'

export const copy = defineCopy('thresholds', {
  label: 'Target reached',
  lead: 'Tell me at',
  hint: 'Told once for each period it is reached',
  numberLabel: 'The number to reach',
  metricLabel: 'What to count',
  periodLabel: 'Over which period',
  metric: { sales: 'sales', revenue: 'revenue', visitors: 'visitors' },
  period: { day: 'in a day', week: 'in a week', month: 'in a month', all: 'in total' },
})
