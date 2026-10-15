// Where the foot sends people. The social profiles are one list: an entry with no address is not drawn, so a
// profile is added by filling in its url, nowhere else.
export const CHANGELOG = 'https://trckable.com/docs/changelog/'
export const DOCS = 'https://trckable.com/docs/'

export type SocialId = 'github' | 'x' | 'linkedin'

export const SOCIALS: { id: SocialId; url: string }[] = [
  { id: 'github', url: 'https://github.com/trckable/trckable' },
  { id: 'x', url: '' },
  { id: 'linkedin', url: '' },
]
