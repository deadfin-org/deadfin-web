import { decode } from 'blurhash';

const cache = new Map<string, string>();

/**
 * Decode a blurhash to a small data URL suitable for a poster placeholder.
 * Decoding is 32×48 (posters are 2:3); the browser upscales with smoothing,
 * which is exactly the soft-glow look we want. Returns undefined for
 * invalid hashes rather than throwing — a bad hash must never break a grid.
 */
export function blurhashToDataUrl(hash: string, w = 32, h = 48): string | undefined {
  const key = `${hash}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const pixels = decode(hash, w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const imageData = ctx.createImageData(w, h);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}
