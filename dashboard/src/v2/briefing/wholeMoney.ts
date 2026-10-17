/** Whole amounts read without their zero cents ("$87", not "$87.00"), as the walkthrough tells them. */
export const wholeMoney = (f: (minor: number) => string) => (minor: number) => f(minor).replace(/[.,]0+(?=\D|$)/, '')
