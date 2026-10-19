/** Throws a readable error unless the call succeeded. */
export function check(step: string, error: unknown, response: Response): void {
  if (error === undefined && response.ok) return;
  throw new Error(`${step} failed (HTTP ${response.status}).`);
}

/**
 * The data of a list endpoint the server may not have (404, 501). Deadfin
 * leaves some optional endpoints out (/Channels, /Devices, /Auth/Providers);
 * the page then hides the section instead of failing.
 */
export function optional<T>(step: string, data: T | undefined, error: unknown, response: Response): T | null {
  if (response.status === 404 || response.status === 501) return null;
  check(step, error, response);
  return data ?? null;
}
