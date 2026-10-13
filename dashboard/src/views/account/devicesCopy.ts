// Every word of the Devices list in the account window.
import { defineCopy } from '../../i18n'

export const devices = defineCopy('account.devices', {
  label: 'Signed-in phones',
  hint: (when: string) => `last used ${when}`,
  platform: {
    ios: 'iOS',
    android: 'Android',
    other: '',
  },
  thisOne: 'this phone',
  remove: 'Remove',
  removeLabel: (name: string) => `Remove ${name}`,
  removeTitle: (name: string) => `Remove "${name}"?`,
  removeBody: 'It is signed out right away. To use trckable there again, sign in again.',
  removing: 'Removing…',
  removed: 'Device removed',
})
