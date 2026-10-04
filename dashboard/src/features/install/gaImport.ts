// Importing from Google Analytics with a Google sign-in: what the server says
// about it, and what the dialog can ask. Never a token: the browser never has one.
import { useCallback, useEffect, useState } from 'react'
import { APIError, call } from '../../lib/api'

export interface GaJob {
  status: 'running' | 'done' | 'paused' | 'denied' | 'stopped'
  property: string
  from: string
  to: string
  done: number
  total: number
  days: number
  code?: string
}

export interface GaProperty {
  id: string
  name: string
  account: string
}

interface GaStatus {
  enabled: boolean
  connected?: boolean
  job?: GaJob
}

const base = (site: string) => `/sites/${encodeURIComponent(site)}/ga`

/** The address that sends the browser to Google. */
export const gaStartUrl = (site: string) => '/api/v1' + base(site) + '/start'

/** The short code the callback leaves in the address when it failed. */
export function gaReturnError(): string {
  return new URLSearchParams(location.search).get('ga_error') ?? ''
}

export function useGaImport(site: string) {
  const [status, setStatus] = useState<GaStatus | null>(null)
  const [properties, setProperties] = useState<GaProperty[] | null>(null)
  const [error, setError] = useState(gaReturnError())
  const load = useCallback(() => call<GaStatus>('GET', base(site), undefined, undefined, true).then(setStatus, () => setStatus({ enabled: false })), [site])
  useEffect(() => {
    void load()
  }, [load])
  const connected = status?.connected === true
  useEffect(() => {
    if (!connected) return
    call<{ properties: GaProperty[] }>('GET', base(site) + '/properties', undefined, undefined, true).then(
      (r) => setProperties(r.properties),
      () => setError('denied'),
    )
  }, [connected, site])
  const running = status?.job?.status === 'running'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => void load(), 1500)
    return () => clearInterval(id)
  }, [running, load])
  const start = (property: string, resume = false) => {
    setError('')
    call('POST', base(site) + '/import', { property, resume }, undefined, true).then(load, (e: unknown) => setError(e instanceof APIError && e.status === 429 ? 'quota' : 'other'))
  }
  const disconnect = () => call('DELETE', base(site), undefined, undefined, true).then(load, load)
  return { status, properties, error, start, disconnect }
}
