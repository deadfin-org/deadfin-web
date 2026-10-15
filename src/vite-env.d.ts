/// <reference types="vite/client" />

/**
 * Build-time injected web identity (issue #26, §9(a)).
 * Typed `unknown` so runtime validation in `src/build.ts` is mandatory.
 */
declare const __DEADFIN_WEB_BUILD__: unknown;

/**
 * Minimal ambient declarations for the `node:` modules and the `process`
 * global that included sources use, so the project typechecks under
 * `tsc --noEmit` without `@types/node` (not a project dependency).
 * When `@types/node` is present (CI), these merge as compatible overloads.
 */
declare module 'node:child_process' {
  export function execFileSync(
    command: string,
    args: readonly string[],
    options: {
      cwd: string;
      stdio: readonly ('ignore' | 'pipe' | 'inherit')[];
      encoding: string;
    },
  ): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}

declare module 'node:fs/promises' {
  export function mkdtemp(prefix: string): Promise<string>;
  export function rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  export function readFile(
    path: string,
    encoding: string,
  ): Promise<string>;
}

declare module 'node:fs' {
  export function readdirSync(dir: string): string[];
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};
