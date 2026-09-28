// The calls only the share sheet and Settings make, kept out of the first load.
import { call, type Milestone } from '../../lib/api'

const path = (site: string, m: Pick<Milestone, 'kind' | 'step'>) => `/sites/${encodeURIComponent(site)}/milestones/${encodeURIComponent(m.kind)}/${encodeURIComponent(m.step)}`

export const shareApi = {
  setOn: (site: string, enabled: boolean) => call<unknown>('PUT', `/sites/${encodeURIComponent(site)}/milestones`, { enabled }),
  share: (site: string, m: Milestone, amount: boolean) => call<{ url: string }>('POST', path(site, m) + '/share', { amount }),
  revoke: (site: string, m: Milestone) => call<unknown>('DELETE', path(site, m) + '/share'),
  /** The card, drawn by the server: png or svg, dark or light. */
  cardURL: (site: string, m: Milestone, o: { format: 'png' | 'svg'; theme: 'dark' | 'light'; amount: boolean }) =>
    `/api/v1${path(site, m)}/card?format=${o.format}&theme=${o.theme}${o.amount ? '&amount=1' : ''}`,
}
