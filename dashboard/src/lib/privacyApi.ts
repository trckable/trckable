// What the Privacy and Payments settings ask of the server, beyond the site
// itself. Loaded with those screens, not with the first page.
import { call, type PersonFound, type PersonPayment } from './api'

export const privacyApi = {
  findPerson: (site: string, by: 'visitor' | 'email', value: string) =>
    call<{ found: PersonFound; payments: PersonPayment[] }>('GET', `/sites/${site}/privacy/person?${by}=${encodeURIComponent(value)}`),
  exportPersonURL: (site: string, by: 'visitor' | 'email', value: string) => `/api/v1/sites/${site}/privacy/export?${by}=${encodeURIComponent(value)}`,
  erasePerson: (site: string, by: 'visitor' | 'email', value: string) =>
    call<{ visitor: string; events: number; sessions: number; payments: number; kept?: string }>(
      'DELETE',
      `/sites/${site}/privacy/person?${by}=${encodeURIComponent(value)}`,
    ),
  startOverKeys: (password: string) => call<{ connections: number }>('POST', '/payments/start-over', { password }),
}
