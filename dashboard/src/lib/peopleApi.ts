// What the People tab asks of the server. Loaded with the account window, not
// with the first page.
import { act, call, type Added, type Person } from './api'

export const peopleApi = {
  people: () => call<{ people: Person[] }>('GET', '/people'),
  addPerson: (email: string, role: string) => call<Added>('POST', '/people', { email, role }),
  setPersonRole: (id: string, role: string) => call<{ people: Person[] }>('PATCH', `/people/${id}`, { role }),
  removePerson: (id: string) => act('DELETE', `/people/${id}`),
  resetPersonPassword: (id: string, password: string, code?: string) => call<{ email: string; password: string }>('POST', `/people/${id}/password`, { password, code }),
  turnOffTwoStepFor: (id: string, password: string, code?: string) => act('POST', `/people/${id}/two-step/off`, { password, code }),
}
