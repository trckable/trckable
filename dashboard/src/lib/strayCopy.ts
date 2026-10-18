import { defineCopy } from '../i18n'

export const strayCopy = defineCopy('address', {
  noSite: (name: string) => `No site called ${name}`,
})
