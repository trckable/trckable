declare const process: { env?: Record<string, string | undefined> } | undefined

// The CLI writes files, but the package still ships without @types/node: this
// is the small part of node:fs/promises `trckable init` actually uses.
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: string): Promise<string>
  export function writeFile(path: string, data: string): Promise<void>
  export function mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>
  export function stat(path: string): Promise<unknown>
}
