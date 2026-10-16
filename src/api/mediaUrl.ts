/**
 * A media URL for an element or a plain fetch, which cannot send the
 * Authorization header, so the token rides the api_key query parameter.
 *
 * `path` comes from the server (DeliveryUrl, TranscodingUrl) or from this
 * client. A relative path resolves against the server URL, base path
 * included. The token goes only to the server the user signed in to: a URL
 * on another origin, or one the server marks external (IsExternalUrl), gets
 * no token. An api_key or ApiKey already on the URL stays as it is.
 */
export function mediaUrl(serverUrl: string, path: string, token: string, opts: { external?: boolean } = {}): string {
  const server = new URL(serverUrl);
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(path) ? path : serverUrl.replace(/\/$/, '') + path);
  const ours = !opts.external && url.origin === server.origin;
  if (ours && !url.searchParams.has('api_key') && !url.searchParams.has('ApiKey')) url.searchParams.set('api_key', token);
  return url.toString();
}
