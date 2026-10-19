import { useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ui.css';

/** Selected tab index from `?tab=`, as jellyfin-web; out-of-range values give 0. */
export function useTabParam(count: number): [number, (i: number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('tab') ?? 0);
  const index = Number.isInteger(raw) && raw >= 0 && raw < count ? raw : 0;
  const select = (i: number) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (i === 0) next.delete('tab');
        else next.set('tab', String(i));
        return next;
      },
      { replace: true },
    );
  return [index, select];
}

/**
 * A tab row bound to `?tab=`. Arrow keys, Home and End move between tabs.
 * The caller renders the panel for the returned index.
 */
export function Tabs(props: { labels: string[]; label: string; selected: number; onSelect: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const n = props.labels.length;
    let to: number | null = null;
    if (e.key === 'ArrowRight') to = (i + 1) % n;
    else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    if (to === null) return;
    e.preventDefault();
    props.onSelect(to);
    refs.current[to]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={props.label}>
      {props.labels.map((l, i) => (
        <button
          key={l}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          className="tab"
          aria-selected={i === props.selected}
          tabIndex={i === props.selected ? 0 : -1}
          onClick={() => props.onSelect(i)}
          onKeyDown={(e) => move(e, i)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
