import { useState } from 'react';
import { blurhashToDataUrl } from '../lib/blurhash';
import './poster.css';

interface PosterProps {
  title: string;
  imageUrl: string;
  blurhash?: string;
  /** Small mono caption after the title: a year, or an episode label. */
  year?: number | string | null;
  /** Watch progress 0–100; renders the bioluminescent strip when > 0. */
  progress?: number;
  /** Renders the surfaced (watched) badge. */
  played?: boolean;
  /** Set false to render the frame only (detail page reuse). */
  caption?: boolean;
}

/**
 * A 2:3 poster card. The blurhash renders instantly as a soft glow in the
 * dark; the real image fades in over it when loaded. Items with no image
 * keep the hash (or a flat surface) plus a mono title plate.
 */
export function Poster({ title, imageUrl, blurhash, year, progress = 0, played = false, caption = true }: PosterProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const placeholder = blurhash ? blurhashToDataUrl(blurhash) : undefined;
  const showImage = imageUrl !== '' && !failed;

  return (
    <figure className="poster" data-testid="poster">
      <div className="poster-frame">
        {placeholder && (
          <img className="poster-hash" src={placeholder} alt="" aria-hidden="true" />
        )}
        {showImage && (
          <img
            className={loaded ? 'poster-img is-loaded' : 'poster-img'}
            src={imageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
        {!showImage && !placeholder && <span className="poster-void readout">no signal</span>}
        {played && (
          <span className="poster-played readout" data-testid="poster-played">
            ✓
          </span>
        )}
        {progress > 0 && (
          <span className="poster-progress" data-testid="poster-progress">
            <span style={{ width: `${Math.min(100, progress)}%` }} />
          </span>
        )}
      </div>
      {caption && (
        <figcaption className="poster-caption">
          <span className="poster-title">{title}</span>
          {year != null && year !== '' && <span className="poster-year readout">{year}</span>}
        </figcaption>
      )}
    </figure>
  );
}
