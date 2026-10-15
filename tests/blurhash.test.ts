import { describe, expect, it } from 'vitest';
import { decode } from 'blurhash';
import { blurhashToDataUrl } from '../src/lib/blurhash';

// A known-valid hash (the blurhash reference example).
const VALID = 'LEHLk~WB2yk8pyo0adR*.7kCMdnj';

describe('blurhash', () => {
  it('the library decodes a valid hash to RGBA pixels', () => {
    const px = decode(VALID, 32, 48);
    expect(px.length).toBe(32 * 48 * 4);
    expect(px.some((v) => v !== 0)).toBe(true);
  });

  it('blurhashToDataUrl never throws on garbage', () => {
    expect(blurhashToDataUrl('not-a-hash')).toBeUndefined();
    expect(blurhashToDataUrl('')).toBeUndefined();
  });

  it('blurhashToDataUrl degrades to undefined without canvas 2d (jsdom)', () => {
    // jsdom has no 2d context; in real browsers this returns a data URL.
    // Either outcome is acceptable here — the contract is "string or undefined,
    // never a throw".
    const out = blurhashToDataUrl(VALID);
    expect(out === undefined || out.startsWith('data:image/')).toBe(true);
  });
});
