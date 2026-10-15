// The domain switcher's words (features/header/DomainSwitch).
import { defineCopy } from '../../i18n'

export const domainCopy = defineCopy('domains', {
  label: 'Domain',
  all: 'All',
  allDomains: 'All domains',
  menuLabel: (now: string) => `Domain: ${now}`,
  search: 'Search domains',
  noMatch: (q: string) => `No domain matches “${q}”.`,
  visitors: (host: string, n: string) => `${host}: ${n} visitors in this period`,
})
