// The refusals of the sign-in and set-up pages: what to do, in plain words.
import { defineCopy } from '../i18n'

export const authCopy = defineCopy('auth', {
  login: 'Wrong email or password. Check them and try again.',
  code: 'That code isn’t right. Use the current one from your app, or a recovery code.',
  token: 'That setup token isn’t right. Copy it again from the server log.',
  mismatch: 'The two passwords don’t match. Type the same one in both.',
})
