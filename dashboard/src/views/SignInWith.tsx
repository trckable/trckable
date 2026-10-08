// The provider buttons on the sign-in screen: only the providers the server
// has set up (Settings of the server, not of the person), each a plain link:
// the browser goes to the provider and comes back signed in.
import { useEffect, useState } from 'react'
import { FieldError } from '../kit/FieldError'
import { api } from '../lib/api'
import { ssoCopy } from './ssoCopy'

export interface SsoProvider {
  id: string
  label: string
}

/** The words for the code the server put in the address after a refused sign-in, or null. */
export function ssoErrorText(search: string): string | null {
  const code = new URLSearchParams(search).get('sso_error')
  if (!code) return null
  return ssoCopy.errors[code] ?? ssoCopy.errors.failed
}

export function SsoButtons({ providers }: { providers: SsoProvider[] }) {
  if (providers.length === 0) return null
  return (
    <div className="sso">
      {providers.map((p) => (
        <a key={p.id} className="btn sso-btn" href={`/api/v1/oidc/${encodeURIComponent(p.id)}/start`}>
          {ssoCopy.with(p.label)}
        </a>
      ))}
    </div>
  )
}

export function SignInWith() {
  const [providers, setProviders] = useState<SsoProvider[]>([])
  const [error] = useState(() => ssoErrorText(location.search))
  useEffect(() => {
    if (error) history.replaceState(null, '', location.pathname) // said once; a reload starts clean
    api
      .setupStatus()
      .then((s) => setProviders(s.sso ?? []))
      .catch(() => {})
  }, [error])
  return (
    <>
      <FieldError id="sso-error" error={error} />
      <SsoButtons providers={providers} />
    </>
  )
}
