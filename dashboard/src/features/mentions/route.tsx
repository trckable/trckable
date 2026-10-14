// Where a site's mentions live: /{domain}/mentions (its page is a chunk of its own, opened by features/subpage.tsx).

export const SUFFIX = '/mentions'

/** The address of a site's mentions page. */
export const mentionsPath = (domain: string) => '/' + encodeURIComponent(domain) + SUFFIX
