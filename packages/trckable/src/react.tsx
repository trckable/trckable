// trckable/react — drop <Analytics /> anywhere in your app (Vite, React Router,
// Remix, CRA…). Renders nothing; safe under StrictMode and server rendering.
//
//   import { Analytics } from 'trckable/react'
//   <Analytics site="tkb_…" host="https://stats.example.com" />
import { useEffect } from 'react'
import { init, type Options } from './index'

export type AnalyticsProps = Options

export function Analytics(props: AnalyticsProps): null {
  useEffect(() => {
    init(props) // idempotent: StrictMode's double effect starts one tracker
    // Options are read once at startup, like the script tag's data attributes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export { track, pageview, consent } from './index'
export type { Options, Props } from './index'
