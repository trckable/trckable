// The card both sign-in screens and the first-password step sit in.
import type { ReactNode } from 'react'
import { Wordmark } from '../components/Logo'

export function Shell({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card rise" style={{ width: 'min(420px, 100%)', padding: 28, gap: 18 }}>
        <Wordmark />
        <div>
          <h1 style={{ fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {sub}
          </p>
        </div>
        {children}
      </div>
    </main>
  )
}
