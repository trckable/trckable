import { api } from './api'

/** Every Sign out: end this session, then go to the sign-in page. */
export function signOut() {
  void api.logout().finally(() => location.assign('/login'))
}
