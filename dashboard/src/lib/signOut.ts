import { api } from './api'
import { clearFeed } from '../v2/bell/feed'

/** Every Sign out: end this session, then go to the sign-in page. */
export function signOut() {
  clearFeed()
  void api.logout().finally(() => location.assign('/login'))
}
