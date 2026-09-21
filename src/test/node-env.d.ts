/**
 * Minimal typings for the Node built-ins used by fixture-loading tests.
 * Kept deliberately tiny so Node globals never leak into browser code.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array;
  export function writeFileSync(path: string | URL, data: Uint8Array | string): void;
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string;
}
declare const __dirname: string;
