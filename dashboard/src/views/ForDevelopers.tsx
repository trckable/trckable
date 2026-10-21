// Settings → General → For developers: what the snippet and the API call this site.
import { Copyable } from '../components/Copyable'
import { Row } from '../components/Row'
import type { Site } from '../lib/apiMore'

export function ForDevelopers({ site }: { site: Site }) {
  return (
    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>For developers</h2>
      </div>
      <Row label="Site id" hint="Used by the snippet and the API">
        <Copyable value={site.id} />
      </Row>

      {/* A credential, so the server sends it to owners only. */}
      {site.proxy_key ? (
        <Row label="Proxy key" hint="Lets your own server forward a visitor's location" tone="danger">
          <Copyable value={site.proxy_key} secret />
        </Row>
      ) : (
        <Row label="Proxy key" hint="Lets your own server forward a visitor's location">
          <span className="faint">Owners only</span>
        </Row>
      )}

    </section>
  )
}
