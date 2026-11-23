// A site without cookies recognises a person only within one UTC day, so the same person on two days
// is counted twice. A count of people over more than one day on such a site is told "counted once per
// day"; a single day, or a site in cookie mode, is just "people". The server decides the same way
// (server/internal/headcount) for the share pictures and the emails.
export const countedOncePerDay = (cookieless: boolean | undefined, days: number): boolean => cookieless === true && days > 1
