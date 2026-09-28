// One method: where it goes, the code (numbered when there are several
// things to do), a copy button on every block, and its page in the docs.
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
        {method.where}
        {method.note && <Info text={method.note} />}
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
              <CodeBlock code={s.code} copyLabel={copy.copyStep(s.title)} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="inst-code-one">
          <CodeBlock code={steps[0].code} copyLabel={copy.copyCode} />
        </div>
      )}
      <a className="inst-docs" href={docsFor(method)} target="_blank" rel="noreferrer">
        {copy.docs(method.name)}
        <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
      </a>
    </div>
  )
}
