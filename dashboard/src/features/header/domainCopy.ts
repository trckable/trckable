// The domain switcher's words (features/header/DomainSwitch).
import { defineCopy } from '../../i18n'

export const domainCopy = defineCopy('domains', {
  label: 'Domain',
  all: 'All',
  allDomains: 'All domains',
  more: 'More',
  visitors: (host: string, n: string) => `${host}: ${n} visitors in this period`,
})
