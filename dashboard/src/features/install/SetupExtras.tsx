// The two quiet rows of the setup screen that are not the code: Install with AI, and the Cookieless switch. They sit on the
// install status card, between its steps and its actions; on a phone, where the card is a bar, the page shows them under the code.
import { AiCard } from './AiCard'
import { CookielessSwitch } from './CookielessSwitch'
import type { Extras } from './Install'
import type { Cookieless } from './useCookieless'
import './install.css'

export function SetupExtras({ extras, cookieless }: { extras: Extras; cookieless: Cookieless }) {
  return (
    <div className="ist-rows">
      <AiCard prompt={extras.prompt} />
      <CookielessSwitch state={cookieless} bundled={extras.bundled} tip />
    </div>
  )
}
