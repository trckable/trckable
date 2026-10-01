// The quiet way in to Settings → Payments, in the strip's free room: only for
// someone who can change settings, only once the report is in and carries no
// money (no provider is connected), and never on a shared link (canChange is
// false there).
export const showsPayHint = (o: { money?: boolean; loading: boolean; canChange: boolean }) => o.canChange && !o.loading && !o.money
