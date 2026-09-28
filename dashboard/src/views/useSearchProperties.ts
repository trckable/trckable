import { useEffect, useState } from 'react'
import { api, messageOf, type SearchConnection, type SearchProperty } from '../lib/api'
import { isViewer } from '../lib/me'

// The properties the connected Google account may read, for the picker.
// Listing them asks Google with the stored key, which the server lets owners
// do: a viewer only reads what is connected, so nothing is fetched for them.
export function useSearchProperties(siteID: string, conn: SearchConnection | null | undefined) {
  const [props, setProps] = useState<SearchProperty[] | null>(null)
  const [propsErr, setPropsErr] = useState('')
  useEffect(() => {
    if (!conn || isViewer()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new account or site starts a new fetch, so the last one's error goes
    setPropsErr('')
    api
      .searchProperties(siteID)
      .then((r) => setProps(r.properties))
      .catch((e: unknown) => setPropsErr(messageOf(e)))
  }, [conn?.client_email, siteID]) // eslint-disable-line react-hooks/exhaustive-deps -- only a new account needs its properties read again, not every other change to conn
  return { props, setProps, propsErr }
}
