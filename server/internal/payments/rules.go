package payments

// RulesVersion numbers the rules that turn stored webhooks into ledger money:
// every provider's Parse and the ledger's money rules. On start the server
// compares it with the version the stored payments were last read with and,
// when it is higher, reads them again in the background, so nobody has to
// press "Recalculate payments" after an upgrade.
//
// Bump it by one in the same change that alters what any Parse returns or how
// the ledger counts an amount, a refund, a dispute or tax. A change that does
// not alter any figure (a new test, a comment) leaves it as it is.
const RulesVersion = 2
