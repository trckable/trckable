// The words of signing in with an identity provider. The server sends short
// codes (never the provider's own text); each becomes a few plain words here.
import { defineCopy } from '../i18n'

const errors: Record<string, string> = {
  failed: 'Sign-in failed',
  denied: 'Sign-in was cancelled',
  unverified: 'That account has no verified email',
  no_account: 'No account here for that email',
  slow: 'Too many tries · Wait a moment',
}

export const ssoCopy = defineCopy('sso', {
  with: (label: string) => `Continue with ${label}`,
  signedInWith: (label: string) => `Signed in with ${label}`,
  errors,
  stepTitle: 'One more step',
  stepSub: 'Your account asks for a code too.',
  codeLabel: 'Code from your app, or a recovery code',
  confirm: 'Confirm',
  confirming: 'Checking…',
  restart: 'Sign in again',
})
