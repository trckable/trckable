// The words of what makes a mention trustworthy: the badge for a page the
// visits confirmed, "Not about us" and what it offers, the hidden list, the
// rules an owner sets, and the warning about a name the news uses for
// something else.
import { defineCopy } from '../../i18n'
import { count } from '../../i18n/helpers'

export const trust = defineCopy('mentionsTrust', {
  confirmed: (n: number) => `Confirmed · ${count(n, 'visit', 'visits')}`,
  confirmedTip: 'This page sent people to your site, so it is certain.',
  notAboutUs: 'Not about us',
  hiddenTitle: 'Hidden. It will not come back.',
  offerExclude: (w: string) => `Exclude “${w}”`,
  offerBlock: (host: string) => `Block ${host}`,
  undo: 'Undo',
  dismiss: 'Done',
  hiddenList: (n: number) => `Hidden · ${n}`,
  restore: 'Restore',
  restoreOne: (title: string) => `Restore: ${title}`,
  ruleSaved: 'Rules saved',
  // Settings: rules
  rulesTitle: 'What counts as a mention',
  rulesIntro: 'Your address always counts. A name counts only with a topic word beside it. When unsure, a mention is not shown.',
  topic: 'Topic words',
  topicHelp: 'A name needs one of these in the same text, like “analytics”.',
  required: 'Required words',
  requiredHelp: 'All of them must be in the text.',
  excluded: 'Excluded words',
  excludedHelp: 'Any of them rules a mention out.',
  blocked: 'Blocked sites',
  blockedHelp: 'Mentions from these sites never count, like reddit.com.',
  addEntry: 'Add',
  removeEntry: (w: string) => `Remove ${w}`,
  saveRules: 'Save rules',
  suggested: (w: string) => `Add “${w}”`,
  suggestedHelp: 'The name in your address. It is searched only once you add it.',
  checking: 'Checking the news…',
  // Look-alike
  lookTitle: (w: string) => `“${w}” is also used for something else in the news`,
  lookFor: 'For example',
  lookAddExclude: 'Add it and exclude these words',
  lookAddOnly: 'Add the word only',
  lookCancel: 'Do not add',
})
