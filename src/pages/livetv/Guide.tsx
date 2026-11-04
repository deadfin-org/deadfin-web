import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { Api } from '../../api/client';
import { primaryImageUrl } from '../../api/client';
import {
  categoryQuery,
  DEFAULT_GUIDE_SETTINGS,
  fetchGuideSettings,
  programCategory,
  saveGuideSettings,
  showsProgram,
  type GuideCategory,
  type GuideSettings,
} from '../../api/guideSettings';
import { fetchListPage, NO_FILTERS, type BaseItem, type Page } from '../../api/library';
import { fetchGuideChannels, fetchGuideInfo, fetchGuidePrograms } from '../../api/liveTv';
import {
  clock,
  dayValue,
  episodeLine,
  guideDays,
  guideWindow,
  isAiring,
  parseDay,
  placeProgram,
  programBadge,
  programLabel,
  timeSlots,
} from '../../api/programs';
import { detailsUrl, videoUrl } from '../../routes/paths';
import { useListState } from '../library/listState';
import { Toolbar } from '../library/Toolbar';
import { GuideSettingsDialog } from './GuideSettings';
import './livetv.css';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
}

/** How programmes are drawn: the saved settings and this visit's categories. */
interface Look {
  settings: GuideSettings;
  categories: GuideCategory[];
}

/** Channels per request. Each page asks for its own day of programmes. */
export const GUIDE_PAGE = 30;

/** Re-renders every `everyMs`; returns the current time. */
function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/**
 * The Guide tab: a time grid of channels × programmes, as jellyfin-web's
 * guide. Today opens at the current half hour; the day picker goes up to
 * the guide's last day. The grid is as tall as every channel, but only the
 * pages of 30 in view are fetched and drawn, each with its programmes for
 * the shown day, so 40,000 channels cost what is on screen. A programme
 * opens its details; a channel plays.
 *
 * Keyboard: one cell is in the Tab order. Arrow keys move between
 * programmes (Up and Down keep the time), Home and End go to the ends of a
 * row, Enter opens.
 */
export function GuideTab({ ctx }: { ctx: Ctx }) {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useListState('mixed');
  const now = useNow();
  // The window of "today" is fixed when the guide opens or jumps to now,
  // so it does not shift (and refetch) every half hour.
  const [anchor, setAnchor] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);

  const info = useQuery({ queryKey: ['guide-info'], staleTime: 5 * 60_000, queryFn: () => fetchGuideInfo(ctx.api) });
  const days = guideDays(info.data?.end ?? null, anchor);
  const picked = parseDay(params.get('day'));
  const day = picked && days.some((d) => d.value === dayValue(picked)) ? picked : anchor;
  const dayKey = dayValue(day);
  const win = useMemo(() => guideWindow(parseDay(dayKey)!, anchor), [dayKey, anchor]);
  const slots = timeSlots(win.start, win.end);

  // Guide settings live in the user's display preferences, shared with jellyfin-web.
  const client = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['guide-settings', ctx.userId], staleTime: Infinity, queryFn: () => fetchGuideSettings(ctx.api, ctx.userId) });
  const settings = settingsQuery.data ?? DEFAULT_GUIDE_SETTINGS;
  const [categories, setCategories] = useState<GuideCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const saveSettings = useMutation({
    mutationFn: (next: { settings: GuideSettings; categories: GuideCategory[] }) => saveGuideSettings(ctx.api, ctx.userId, next.settings),
    onSuccess: (_, next) => {
      client.setQueryData(['guide-settings', ctx.userId], next.settings);
      setCategories(next.categories);
      setEditing(false);
    },
  });
  const look: Look = { settings, categories };

  const list = state.list;
  const channelOpts = {
    favoritesAtTop: settings.favoritesAtTop,
    recentlyWatched: settings.channelOrder === 'DatePlayed',
    categories: categoryQuery(categories),
  };
  const fetchChannels = (page: number): Promise<Page> =>
    list
      ? fetchListPage(ctx.api, 'items', {
          userId: ctx.userId,
          parentId: list,
          recursive: false,
          sortBy: state.sortBy,
          descending: false,
          filters: NO_FILTERS,
          startIndex: page * GUIDE_PAGE,
          limit: GUIDE_PAGE,
        })
      : fetchGuideChannels(ctx.api, ctx.userId, page * GUIDE_PAGE, GUIDE_PAGE, channelOpts);

  // Only the pages of channels in view, and one either side, are fetched
  // and drawn; the rest of the grid is empty space of the right height, so
  // the scrollbar spans every channel and the DOM stays small at 40k.
  const [range, setRange] = useState({ from: 0, to: 1 });
  const rowHeight = useRef(64);
  const shown = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);
  const pageQueries = useQueries({
    queries: [0, ...shown.filter((p) => p !== 0)].map((page) => ({
      queryKey: ['guide-channels', ctx.userId, list, list ? null : channelOpts, page],
      staleTime: 5 * 60_000,
      // The channel order follows the settings; wait for them so the first page is asked once.
      enabled: !settingsQuery.isPending,
      queryFn: () => fetchChannels(page),
    })),
  });
  const first = pageQueries[0]!;
  const pageOf = new Map<number, Page>();
  [0, ...shown.filter((p) => p !== 0)].forEach((page, i) => {
    const data = pageQueries[i]!.data;
    if (data) pageOf.set(page, data);
  });
  const total = first.data ? channelCount(pageOf) : undefined;
  const pageCount = total === undefined ? 1 : Math.max(1, Math.ceil(total / GUIDE_PAGE));

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const head = el.querySelector<HTMLElement>('.guide-head')?.offsetHeight ?? 0;
    const row = el.querySelector<HTMLElement>('.guide-row')?.offsetHeight;
    if (row) rowHeight.current = row;
    const top = Math.max(0, el.scrollTop - head);
    const firstPage = Math.floor(top / rowHeight.current / GUIDE_PAGE);
    const lastPage = Math.floor((top + el.clientHeight) / rowHeight.current / GUIDE_PAGE);
    const next = { from: Math.max(0, firstPage - 1), to: Math.min(pageCount - 1, lastPage + 1) };
    setRange((r) => (r.from === next.from && r.to === next.to ? r : next));
  };
  // The page count is known once the first page is in.
  useEffect(onScroll, [pageCount]);
  // Another channel list, order or category starts at its top.
  const orderKey = JSON.stringify([list, channelOpts]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
    setRange({ from: 0, to: 1 });
  }, [orderKey]);

  // Roving focus: one cell (by data-key) is tabbable.
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => setActive(null), [dayKey, anchor, list]);
  // When the active cell has scrolled out of the window, the first drawn cell takes the Tab stop.
  useEffect(() => {
    const grid = scroller.current;
    if (!grid || grid.querySelector('[data-key][tabindex="0"]')) return;
    const key = grid.querySelector<HTMLElement>('[data-key]')?.dataset.key;
    if (key) setActive(key);
  });

  const setDay = (value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === days[0]?.value) next.delete('day');
        else next.set('day', value);
        return next;
      },
      { replace: true },
    );

  const jumpToNow = () => {
    setDay(dayValue(new Date()));
    setAnchor(new Date());
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollTop = 0;
    setRange({ from: 0, to: Math.min(1, pageCount - 1) });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = moveTarget(e.currentTarget, e.target as HTMLElement, e.key);
    if (!target) return;
    e.preventDefault();
    setActive(target.dataset.key ?? null);
    target.focus();
  };

  const nowFrac = (now.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime());
  const gridStyle = { '--guide-slots': slots.length } as CSSProperties;

  return (
    <div className="library-list guide" data-testid="guide">
      <Toolbar total={first.data && first.data.total !== Number.MAX_SAFE_INTEGER ? total : undefined} state={state} onChange={setState} channelLists>
        <select className="guide-day" value={dayKey} onChange={(e) => setDay(e.target.value)} aria-label="Day" data-testid="guide-day">
          {days.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <button type="button" className="library-order readout" onClick={jumpToNow} data-testid="guide-now">
          Now
        </button>
        <button type="button" className="library-order readout" onClick={() => setEditing(true)} data-testid="guide-settings-open">
          Settings
        </button>
      </Toolbar>
      {editing && (
        <GuideSettingsDialog
          settings={settings}
          categories={categories}
          busy={saveSettings.isPending}
          error={saveSettings.isError ? saveSettings.error.message : null}
          onSave={(next, cats) => saveSettings.mutate({ settings: next, categories: cats })}
          onClose={() => {
            setEditing(false);
            saveSettings.reset();
          }}
        />
      )}
      {first.isError ? (
        <p className="home-status readout" role="alert">
          The guide could not be loaded.
        </p>
      ) : first.isPending ? (
        <p className="home-status readout">Loading…</p>
      ) : total === 0 ? (
        <p className="home-status readout" data-testid="library-empty">
          No channels found.
        </p>
      ) : (
        <div className="guide-scroll" ref={scroller} onScroll={onScroll} data-testid="guide-scroll">
          <div className="guide-grid" style={gridStyle} role="grid" aria-label="TV guide" aria-rowcount={(total ?? 0) + 1} onKeyDown={onKeyDown}>
            <div className="guide-head" role="row" aria-rowindex={1}>
              <div className="guide-corner readout" role="columnheader">
                {dayLabelOf(days, dayKey)}
              </div>
              <div className="guide-times" role="presentation">
                {slots.map((s) => (
                  <div key={s.getTime()} className="guide-time readout" role="columnheader">
                    {clock(s)}
                  </div>
                ))}
              </div>
            </div>
            {nowFrac >= 0 && nowFrac < 1 && (
              <div className="guide-now" style={{ '--guide-now': nowFrac } as CSSProperties} aria-hidden="true" data-testid="guide-now-line" />
            )}
            <div style={{ height: rowsHeight(range.from * GUIDE_PAGE) }} aria-hidden="true" />
            {shown.map((page) => {
              const data = pageOf.get(page);
              const rows = Math.min(GUIDE_PAGE, (total ?? 0) - page * GUIDE_PAGE);
              if (rows <= 0) return null;
              return data ? (
                <GuidePage
                  key={page}
                  ctx={ctx}
                  channels={data.items}
                  rowOffset={data.startIndex}
                  win={win}
                  now={now}
                  look={look}
                  active={active}
                  onFocusCell={setActive}
                />
              ) : (
                <div key={page} className="guide-pending" style={{ height: rowsHeight(rows) }} aria-busy="true" />
              );
            })}
            <div style={{ height: rowsHeight(Math.max(0, (total ?? 0) - (range.to + 1) * GUIDE_PAGE)) }} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

/** The height of `n` guide rows, from the --guide-row token. */
function rowsHeight(n: number): string {
  return `calc(${n} * var(--guide-row))`;
}

/**
 * How many channels the guide has. Endpoints without a total (a channel
 * list's /Items always has one) count what is loaded, plus a page while
 * the last loaded page is full.
 */
export function channelCount(pages: Map<number, Page>): number {
  const firstPage = pages.get(0);
  if (firstPage && firstPage.total !== Number.MAX_SAFE_INTEGER) return firstPage.total;
  let end = 0;
  let full = false;
  for (const p of pages.values()) {
    const e = p.startIndex + p.items.length;
    if (e >= end) {
      end = e;
      full = p.items.length === GUIDE_PAGE;
    }
  }
  return full ? end + GUIDE_PAGE : end;
}

function dayLabelOf(days: { value: string; label: string }[], value: string): string {
  return days.find((d) => d.value === value)?.label ?? '';
}

/** One page of channels and their programmes for the window. */
function GuidePage(props: {
  ctx: Ctx;
  channels: BaseItem[];
  rowOffset: number;
  win: { start: Date; end: Date };
  now: Date;
  look: Look;
  active: string | null;
  onFocusCell: (key: string) => void;
}) {
  const { ctx, channels, win } = props;
  const ids = channels.map((c) => c.Id ?? '').filter(Boolean);
  const programs = useQuery({
    queryKey: ['guide-programs', ctx.userId, ids, win.start.getTime()],
    staleTime: 60_000,
    queryFn: () => fetchGuidePrograms(ctx.api, ctx.userId, ids, win.start, win.end),
  });
  const byChannel = useMemo(() => {
    const m = new Map<string, BaseItem[]>();
    for (const p of programs.data ?? []) {
      const list = m.get(p.ChannelId ?? '') ?? [];
      list.push(p);
      m.set(p.ChannelId ?? '', list);
    }
    for (const list of m.values()) list.sort((a, b) => Date.parse(a.StartDate ?? '') - Date.parse(b.StartDate ?? ''));
    return m;
  }, [programs.data]);

  return (
    <>
      {channels.map((ch, i) => (
        <div key={ch.Id} className="guide-row" role="row" aria-rowindex={props.rowOffset + i + 2} data-testid="guide-row">
          <ChannelCell ctx={ctx} channel={ch} active={props.active} onFocusCell={props.onFocusCell} />
          <div className="guide-programs" role="presentation">
            {programs.isPending ? (
              <div className="guide-empty readout" aria-busy="true" />
            ) : (
              <ProgramCells
                programs={byChannel.get(ch.Id ?? '') ?? []}
                win={win}
                now={props.now}
                look={props.look}
                active={props.active}
                onFocusCell={props.onFocusCell}
                failed={programs.isError}
              />
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function ChannelCell(props: { ctx: Ctx; channel: BaseItem; active: string | null; onFocusCell: (key: string) => void }) {
  const ch = props.channel;
  const key = `c:${ch.Id}`;
  const logo = primaryImageUrl(props.ctx.serverUrl, ch, 120);
  const number = ch.ChannelNumber ?? ch.Number;
  return (
    <div className="guide-channel" role="rowheader">
      <Link
        to={videoUrl(ch.Id ?? '')}
        className="guide-channel-link"
        data-key={key}
        data-cell="channel"
        tabIndex={props.active === key ? 0 : -1}
        onFocus={() => props.onFocusCell(key)}
        aria-label={`Play ${ch.Name ?? 'channel'}`}
        title="Play"
        data-testid="guide-channel"
      >
        {logo ? <img src={logo} alt="" loading="lazy" className="guide-logo" /> : <span className="guide-logo" aria-hidden="true" />}
        <span className="guide-channel-text">
          {number && <span className="guide-channel-number readout">{number}</span>}
          <span className="guide-channel-name">{ch.Name}</span>
        </span>
      </Link>
    </div>
  );
}

function ProgramCells(props: {
  programs: BaseItem[];
  win: { start: Date; end: Date };
  now: Date;
  look: Look;
  active: string | null;
  onFocusCell: (key: string) => void;
  failed: boolean;
}) {
  const { settings, categories } = props.look;
  const placed = props.programs
    .map((p) => ({ p, at: placeProgram(p, props.win.start, props.win.end) }))
    .filter((x): x is { p: BaseItem; at: NonNullable<typeof x.at> } => x.at !== null);
  if (placed.length === 0)
    return (
      <div className="guide-empty readout" role="gridcell">
        {props.failed ? 'Programs could not be loaded.' : 'No guide data'}
      </div>
    );
  return (
    <>
      {placed.map(({ p, at }) => {
        const key = `p:${p.Id}`;
        const badge = programBadge(p, settings.indicators);
        const episode = episodeLine(p);
        const airing = isAiring(p, props.now);
        // A programme outside the picked categories keeps its cell, without its title (jellyfin-web).
        const shown = showsProgram(p, categories);
        const category = shown && settings.colorCoded ? programCategory(p) : null;
        const cls = ['guide-program', airing && 'is-now', category && `is-${category}`].filter(Boolean).join(' ');
        return (
          <div key={p.Id} role="gridcell" className="guide-cell" style={{ left: `${at.left * 100}%`, width: `${at.width * 100}%` }}>
            <Link
              to={detailsUrl(p.Id ?? '')}
              className={cls}
              data-key={key}
              data-cell="program"
              data-start={Math.max(Date.parse(p.StartDate ?? ''), props.win.start.getTime())}
              tabIndex={props.active === key ? 0 : -1}
              onFocus={() => props.onFocusCell(key)}
              aria-label={programLabel(p, props.now, settings.indicators)}
              data-testid="guide-program"
            >
              {shown && (
                <>
                  <span className="guide-program-name">
                    {at.clipped && <span aria-hidden="true">‹ </span>}
                    {p.Name}
                    {badge && <span className={`program-badge is-${badge.toLowerCase()}`}>{badge}</span>}
                    {settings.indicators.hd && p.IsHD && <span className="program-badge is-hd">HD</span>}
                  </span>
                  {episode && <span className="guide-program-episode">{episode}</span>}
                </>
              )}
            </Link>
          </div>
        );
      })}
    </>
  );
}

/**
 * The cell a key moves to from `from`, or null. Left and Right walk the
 * row (the channel cell is its first stop); Up and Down pick the programme
 * on the next row that covers the same time; Home and End the row's ends.
 */
export function moveTarget(grid: HTMLElement, from: HTMLElement, key: string): HTMLElement | null {
  const row = from.closest('[role="row"]');
  if (!row || !from.dataset.key) return null;
  const cells = (r: Element) => Array.from(r.querySelectorAll<HTMLElement>('[data-key]'));
  const here = cells(row);
  const i = here.indexOf(from);
  switch (key) {
    case 'ArrowRight':
      return here[i + 1] ?? null;
    case 'ArrowLeft':
      return here[i - 1] ?? null;
    case 'Home':
      return here[0] ?? null;
    case 'End':
      return here[here.length - 1] ?? null;
    case 'ArrowUp':
    case 'ArrowDown': {
      const rows = Array.from(grid.querySelectorAll('[role="row"]')).filter((r) => r.querySelector('[data-key]'));
      const next = rows[rows.indexOf(row) + (key === 'ArrowDown' ? 1 : -1)];
      if (!next) return null;
      const there = cells(next);
      if (from.dataset.cell === 'channel') return there[0] ?? null;
      const at = Number(from.dataset.start);
      const programs = there.filter((c) => c.dataset.cell === 'program');
      // The last programme that starts at or before this time covers it.
      let pick: HTMLElement | undefined;
      for (const c of programs) if (Number(c.dataset.start) <= at) pick = c;
      return pick ?? programs[0] ?? there[0] ?? null;
    }
  }
  return null;
}
