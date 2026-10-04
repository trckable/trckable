import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SsoButtons, ssoErrorText } from './SignInWith'
import { localPath } from './SsoCode'
import { SignedInWith } from './AccountLine'

describe('the provider buttons on the sign-in screen', () => {
  it('show nothing when the server has no provider set up', () => {
    expect(renderToStaticMarkup(<SsoButtons providers={[]} />)).toBe('')
  })

  it('show one link per provider the server named, to its own start address', () => {
    const html = renderToStaticMarkup(
      <SsoButtons
        providers={[
          { id: 'google', label: 'Google' },
          { id: 'acme sso', label: 'Acme SSO' },
        ]}
      />,
    )
    expect(html).toContain('href="/api/v1/oidc/google/start"')
    expect(html).toContain('Continue with Google')
    expect(html).toContain('href="/api/v1/oidc/acme%20sso/start"')
    expect(html.match(/<a /g)).toHaveLength(2)
  })

  it('does not put the label in an address', () => {
    expect(renderToStaticMarkup(<SsoButtons providers={[{ id: 'g', label: '"><script>' }]} />)).not.toContain('<script>')
  })
})

describe('what a refused sign-in says', () => {
  it('turns the server\'s short code into words, and anything unknown into the plain failure', () => {
    expect(ssoErrorText('?sso_error=no_account')).toBe('No account here for that email')
    expect(ssoErrorText('?sso_error=denied')).toBe('Sign-in was cancelled')
    expect(ssoErrorText('?sso_error=<b>hi</b>')).toBe('Sign-in failed')
    expect(ssoErrorText('')).toBeNull()
  })
})

describe('the way after the second step', () => {
  it('opens only a path on this site', () => {
    expect(localPath('/site.com?x=1')).toBe('/site.com?x=1')
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '']) expect(localPath(bad)).toBe('/')
  })
})

describe('the account line', () => {
  it('says which provider signed this browser in, and is absent for a password', () => {
    expect(renderToStaticMarkup(<SignedInWith provider="Google" />)).toContain('Signed in with Google')
    expect(renderToStaticMarkup(<SignedInWith />)).toBe('')
  })
})
