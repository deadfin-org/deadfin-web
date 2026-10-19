import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import {
  activeFilterCount,
  countLabel,
  fetchFilterValues,
  NO_FILTERS,
  type Feature,
  type ItemKind,
  type ListFilters,
  type SeriesStatus,
  type StatusFilter,
  type VideoBasic,
  type VideoType,
} from '../../api/library';
import { SORTS, type SortSet } from '../../api/sorts';
import type { FilterGroup } from './views';
import type { ListState } from './listState';

/** Count, Sort and Filter above a streamed list, as jellyfin-web `LibraryToolbar`. */
export function Toolbar(props: {
  total?: number;
  state: ListState;
  onChange: (s: ListState) => void;
  sorts?: SortSet;
  filters?: FilterGroup[];
  alphabet?: boolean;
  parentId?: string | null;
  itemTypes?: ItemKind[];
}) {
  const { state, onChange } = props;
  return (
    <>
      <div className="library-controls" role="group" aria-label="Sort and filter">
        <span className="readout" data-testid="library-count">
          {props.total === undefined ? '· · ·' : countLabel(props.total)}
        </span>
        {props.sorts && <SortMenu sorts={props.sorts} state={state} onChange={onChange} />}
        {props.filters && props.filters.length > 0 && (
          <FilterButton
            groups={props.filters}
            state={state}
            onChange={onChange}
            parentId={props.parentId}
            itemTypes={props.itemTypes}
          />
        )}
      </div>
      {props.alphabet && <AlphabetPicker letter={state.letter} onPick={(letter) => onChange({ ...state, letter })} />}
    </>
  );
}

/** Closes a popover on Escape or a click outside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);
  return ref;
}

function SortMenu(props: { sorts: SortSet; state: ListState; onChange: (s: ListState) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const options = SORTS[props.sorts];
  const current = options.find((o) => o.by.join(',') === props.state.sortBy.join(','));
  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className="library-order readout"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Sort: {current?.label ?? 'Name'} {props.state.descending ? '↓' : '↑'}
      </button>
      {open && (
        <ul className="popover-menu" role="menu" aria-label="Sort">
          {options.map((o) => {
            const selected = o === current;
            return (
              <li key={o.by.join(',')} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className="popover-item"
                  // Choosing the current sort again flips the order, as in jellyfin-web.
                  onClick={() => {
                    props.onChange({ ...props.state, sortBy: o.by, descending: selected ? !props.state.descending : false });
                    setOpen(false);
                  }}
                >
                  <span>{o.label}</span>
                  {selected && <span aria-label={props.state.descending ? 'Descending' : 'Ascending'}>{props.state.descending ? '↓' : '↑'}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const STATUS: { label: string; value: StatusFilter }[] = [
  { label: 'Played', value: 'IsPlayed' },
  { label: 'Unplayed', value: 'IsUnplayed' },
  { label: 'Favorite', value: 'IsFavorite' },
  { label: 'Continue watching', value: 'IsResumable' },
];
const FEATURES: { label: string; value: Feature }[] = [
  { label: 'Subtitles', value: 'HasSubtitles' },
  { label: 'Trailers', value: 'HasTrailer' },
  { label: 'Extras', value: 'HasSpecialFeature' },
  { label: 'Theme songs', value: 'HasThemeSong' },
  { label: 'Theme videos', value: 'HasThemeVideo' },
];
const VIDEO: { label: string; value: VideoBasic }[] = [
  { label: 'SD', value: 'IsSD' },
  { label: 'HD', value: 'IsHD' },
  { label: '4K', value: 'Is4K' },
  { label: '3D', value: 'Is3D' },
];
const VIDEO_TYPES: { label: string; value: VideoType }[] = [
  { label: 'DVD', value: 'Dvd' },
  { label: 'Blu-ray', value: 'BluRay' },
  { label: 'ISO', value: 'Iso' },
];
const SERIES_STATUS: { label: string; value: SeriesStatus }[] = [
  { label: 'Continuing', value: 'Continuing' },
  { label: 'Ended', value: 'Ended' },
  { label: 'Not yet released', value: 'Unreleased' },
];

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Filter button and dialog. Genres, ratings, tags and years load only when the dialog opens. */
function FilterButton(props: {
  groups: FilterGroup[];
  state: ListState;
  onChange: (s: ListState) => void;
  parentId?: string | null;
  itemTypes?: ItemKind[];
}) {
  const { session, api } = useAuth();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  // The URL update runs as a router transition; local state keeps the boxes in step meanwhile.
  const fromUrl = props.state.filters;
  const [f, setF] = useState(fromUrl);
  const urlKey = JSON.stringify(fromUrl);
  useEffect(() => setF(JSON.parse(urlKey) as ListFilters), [urlKey]);
  const groups = new Set(props.groups);
  const needValues = groups.has('values') || groups.has('tags');
  const values = useQuery({
    queryKey: ['filter-values', session?.userId, props.parentId, props.itemTypes],
    enabled: open && needValues && !!api,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFilterValues(api!, session!.userId, props.parentId, props.itemTypes),
  });

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) d.close?.();
  }, [open]);

  const set = (patch: Partial<ListFilters>) => {
    const next = { ...f, ...patch };
    setF(next);
    props.onChange({ ...props.state, filters: next });
  };
  const n = activeFilterCount(f);

  // Played and Unplayed exclude each other.
  const toggleStatus = (v: StatusFilter) => {
    const other = v === 'IsPlayed' ? 'IsUnplayed' : v === 'IsUnplayed' ? 'IsPlayed' : null;
    set({ status: toggle(f.status.filter((s) => s !== other), v) });
  };

  return (
    <>
      <button type="button" className="library-order readout" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Filter{n > 0 ? ` (${n})` : ''}
      </button>
      <dialog ref={dialog} className="filter-dialog" aria-label="Filters" onClose={() => setOpen(false)}>
        {open && (
          <div className="filter-body">
            <h2 className="filter-title">Filters</h2>
            {groups.has('status') && (
              <Checks title="Filters" options={STATUS} selected={f.status} onToggle={toggleStatus} />
            )}
            {groups.has('favorite') && (
              <Checks title="Filters" options={STATUS.filter((s) => s.value === 'IsFavorite')} selected={f.status} onToggle={toggleStatus} />
            )}
            {groups.has('seriesStatus') && (
              <Checks title="Series Status" options={SERIES_STATUS} selected={f.seriesStatus} onToggle={(v) => set({ seriesStatus: toggle(f.seriesStatus, v) })} />
            )}
            {groups.has('features') && (
              <Checks title="Features" options={FEATURES} selected={f.features} onToggle={(v) => set({ features: toggle(f.features, v) })} />
            )}
            {groups.has('video') && (
              <FilterSection title="Video Type">
                <CheckList options={VIDEO} selected={f.video} onToggle={(v) => set({ video: toggle(f.video, v) })} />
                <CheckList options={VIDEO_TYPES} selected={f.videoTypes} onToggle={(v) => set({ videoTypes: toggle(f.videoTypes, v) })} />
              </FilterSection>
            )}
            {needValues && values.isPending && <p className="readout">Loading…</p>}
            {needValues && values.isError && <p className="readout" role="alert">Filters could not be loaded.</p>}
            {values.data && groups.has('values') && (
              <>
                <ValueChecks title="Genres" values={values.data.genres} selected={f.genres} onToggle={(v) => set({ genres: toggle(f.genres, v) })} />
                <ValueChecks title="Parental rating" values={values.data.ratings} selected={f.ratings} onToggle={(v) => set({ ratings: toggle(f.ratings, v) })} />
              </>
            )}
            {values.data && (groups.has('values') || groups.has('tags')) && (
              <ValueChecks title="Tags" values={values.data.tags} selected={f.tags} onToggle={(v) => set({ tags: toggle(f.tags, v) })} />
            )}
            {values.data && groups.has('values') && (
              <ValueChecks
                title="Years"
                values={values.data.years.map(String)}
                selected={f.years.map(String)}
                onToggle={(v) => set({ years: toggle(f.years, Number(v)) })}
              />
            )}
            <div className="filter-actions">
              <button type="button" className="library-order readout" disabled={n === 0} onClick={() => set(NO_FILTERS)}>
                Reset filters
              </button>
              <button type="button" className="library-order readout" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

function FilterSection(props: { title: string; children: ReactNode }) {
  return (
    <fieldset className="filter-section">
      <legend className="filter-legend">{props.title}</legend>
      {props.children}
    </fieldset>
  );
}

function CheckList<T extends string>(props: { options: { label: string; value: T }[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <>
      {props.options.map((o) => (
        <label key={o.value} className="form-check">
          <input type="checkbox" checked={props.selected.includes(o.value)} onChange={() => props.onToggle(o.value)} />
          {o.label}
        </label>
      ))}
    </>
  );
}

function Checks<T extends string>(props: { title: string; options: { label: string; value: T }[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <FilterSection title={props.title}>
      <CheckList options={props.options} selected={props.selected} onToggle={props.onToggle} />
    </FilterSection>
  );
}

/** A long value list (a Live TV playlist can have hundreds of categories) scrolls inside its section. */
function ValueChecks(props: { title: string; values: string[]; selected: string[]; onToggle: (v: string) => void }) {
  if (props.values.length === 0) return null;
  return (
    <FilterSection title={props.title}>
      <div className="filter-values">
        <CheckList options={props.values.map((v) => ({ label: v, value: v }))} selected={props.selected} onToggle={props.onToggle} />
      </div>
    </FilterSection>
  );
}

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** jellyfin-web `AlphabetPicker`: a letter limits the list to names that start with it; again clears it. */
function AlphabetPicker(props: { letter: string | null; onPick: (l: string | null) => void }) {
  return (
    <div className="alphabet-picker" role="group" aria-label="Alphabet">
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          className="alphabet-letter"
          aria-pressed={props.letter === l}
          onClick={() => props.onPick(props.letter === l ? null : l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
