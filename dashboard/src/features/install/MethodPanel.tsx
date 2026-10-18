// One method: where it goes and its docs page on one small line, then the code (numbered when
// there are several things to do) with its copy button inside the block.
import { ExternalLink } from 'lucide-react'
import { CodeBlock } from '../../components/Code'
import { Info } from '../../components/Info'
import type { Ctx, Method } from '../../lib/install'
import { copy } from './copy'
import { panelId, tabId } from './MethodTabs'
import { docsFor, stepsFor } from './snippet'

export function MethodPanel({ method, ctx }: { method: Method; ctx: Ctx }) {
  const steps = stepsFor(method, ctx)
  const many = steps.length > 1
  return (
    <div key={method.id} id={panelId} role="tabpanel" aria-labelledby={tabId(method.id)} className="inst-panel rise">
      <p className="inst-where">
        <span>
          {method.where}
          {method.note && <Info text={method.note} />}
        </span>
        <a className="inst-docs" href={docsFor(method)} target="_blank" rel="noreferrer">
          {copy.docs(method.name)}
          <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </p>
      {many ? (
        <ol className="inst-steps">
          {steps.map((s, n) => (
            <li key={s.title}>
              <span className="inst-step-title">
                <span className="inst-step-n" aria-hidden="true">
                  {n + 1}
                </span>
                {s.title}
              </span>
              <CodeBlock code={s.code} copyLabel={copy.copyStep(s.title)} compact />
            </li>
          ))}
        </ol>
      ) : (
        <CodeBlock code={steps[0].code} copyLabel={copy.copyCode} compact />
      )}
    </div>
  )
}
