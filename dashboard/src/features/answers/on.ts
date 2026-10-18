// Answers is a prototype: it is offered only in a development build running the fixture (?fixture=answers).
export const hasAnswers = (): boolean => import.meta.env.DEV && !!(globalThis as { trckableFixture?: { answers?: boolean } }).trckableFixture?.answers
