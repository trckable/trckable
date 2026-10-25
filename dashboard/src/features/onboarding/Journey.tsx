// The first run's one picture: [your site] —— line —— [trckable]. It dims while the
// address is typed, glows while a first visit is awaited (more once the code is copied),
// and when the visit comes a dot travels along the line into the mark. For screen
// readers it is only the text of the step.
import { Check } from 'lucide-react'
import { SiteMark } from '../../components/SiteMark'
import { ghostSvg } from '../../brand/logo'
import { useNarrow } from '../../lib/useNarrow'
import { copy } from './copy'
import { STEPS, stepAt, type Step } from './model'

export function Journey({ step, domain, copied }: { step: Step; domain: string; copied: boolean }) {
  const at = stepAt(step)
  // A phone makes the journey the hero of the short steps.
  const hero = useNarrow() && step !== 'install'
  const names = [copy.steps.site, copy.steps.code, copy.steps.visit]
  return (
    <>
      <p className="sr ob-progress">{copy.progress(at + 1, STEPS.length, names[at])}</p>
      <div className="ob-journey" data-step={step} data-copied={copied} aria-hidden="true">
        <div className={domain ? 'ob-j-site' : 'ob-j-site empty'}>
          <SiteMark site={{ domain: domain || copy.preview.empty }} size={hero ? 56 : 22} />
          <b>{domain || copy.preview.empty}</b>
        </div>
        <div className="ob-j-line">
          <i className="ob-j-dot" />
        </div>
        <div className="ob-j-mark">
          <span dangerouslySetInnerHTML={{ __html: ghostSvg(34) }} />
          <span className="ob-j-badge">
            <Check strokeWidth={3} />
          </span>
        </div>
      </div>
    </>
  )
}
