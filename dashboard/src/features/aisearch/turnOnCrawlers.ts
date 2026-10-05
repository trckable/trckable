// The card's one action: switch the AI crawlers module on, tell the dashboard,
// and show where the robots are listed. Its own chunk: nothing here is needed
// until someone says yes.
import type { Site } from '../../lib/api'
import { fail, more } from '../../lib/apiMore'
import { modulesChanged } from '../../lib/useMods'
import { openAiSearch } from './open'

export default function turnOnCrawlers(site: Site) {
  more
    .setModule(site.id, 'crawlers', true)
    .then(() => {
      modulesChanged()
      openAiSearch(site)
    })
    .catch((e: unknown) => fail(e))
}
