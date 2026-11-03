import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { Api } from '../../api/client';
import { primaryImageUrl } from '../../api/client';
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
import './livetv.css';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
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
 * the guide's last day. Channels stream in pages as the grid scrolls, and
 * each page loads its programmes for the shown day. A programme opens its
 * details; a channel plays.
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

  const list = state.list;
  const channels = useInfiniteQuery({
    queryKey: ['guide-channels', ctx.userId, list],
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<Page> =>
      list
        ? fetchListPage(ctx.api, 'items', {
            userId: ctx.userId,
            parentId: list,
            recursive: false,
            sortBy: state.sortBy,
            descending: false,
            filters: NO_FILTERS,
            startIndex: pageParam,
            limit: GUIDE_PAGE,
          })
        : fetchGuideChannels(ctx.api, ctx.userId, pageParam, GUIDE_PAGE),
    getNextPageParam: (last) => {
      const next = last.startIndex + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
  });
  const pages = channels.data?.pages ?? [];
  const total = pages[0] && pages[0].total !== Number.MAX_SAFE_INTEGER ? pages[0].total : undefined;

  // The next page loads when the end of the grid scrolls near.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = channels;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && !isFetchingNextPage && void fetchNextPage(), {
      root: scroller.current,
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Roving focus: one cell (by data-key) is tabbable.
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => setActive(null), [dayKey, anchor, list]);

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
      <Toolbar total={total} state={state} onChange={setState} channelLists>
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
      </Toolbar>
      {channels.isError ? (
        <p className="home-status readout" role="alert">
          The guide could not be loaded.
        </p>
      ) : channels.isPending ? (
        <p className="home-status readout">Loading…</p>
      ) : pages[0]!.items.length === 0 ? (
        <p className="home-status readout" data-testid="library-empty">
          No channels found.
        </p>
      ) : (
        <div className="guide-scroll" ref={scroller}>
          <div className="guide-grid" style={gridStyle} role="grid" aria-label="TV guide" aria-rowcount={total ? total + 1 : -1} onKeyDown={onKeyDown}>
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
            {pages.map((page, i) => (
              <GuidePage
                key={page.startIndex}
                ctx={ctx}
                channels={page.items}
                rowOffset={page.startIndex}
                win={win}
                now={now}
                active={active ?? (i === 0 ? firstKey(page.items) : null)}
                onFocusCell={setActive}
              />
            ))}
            <div ref={sentinel} />
          </div>
        </div>
      )}
      {hasNextPage && (
        <button className="library-more readout" data-testid="library-more" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? 'Loading…' : 'More channels'}
        </button>
      )}
    </div>
  );
}

function dayLabelOf(days: { value: string; label: string }[], value: string): string {
  return days.find((d) => d.value === value)?.label ?? '';
}

function firstKey(channels: BaseItem[]): string | null {
  return channels[0]?.Id ? `c:${channels[0].Id}` : null;
}

/** One page of channels and their programmes for the window. */
function GuidePage(props: {
  ctx: Ctx;
  channels: BaseItem[];
  rowOffset: number;
  win: { start: Date; end: Date };
  now: Date;
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
  active: string | null;
  onFocusCell: (key: string) => void;
  failed: boolean;
}) {
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
        const badge = programBadge(p);
        const episode = episodeLine(p);
        const airing = isAiring(p, props.now);
        return (
          <div key={p.Id} role="gridcell" className="guide-cell" style={{ left: `${at.left * 100}%`, width: `${at.width * 100}%` }}>
            <Link
              to={detailsUrl(p.Id ?? '')}
              className={airing ? 'guide-program is-now' : 'guide-program'}
              data-key={key}
              data-cell="program"
              data-start={Math.max(Date.parse(p.StartDate ?? ''), props.win.start.getTime())}
              tabIndex={props.active === key ? 0 : -1}
              onFocus={() => props.onFocusCell(key)}
              aria-label={programLabel(p, props.now)}
              data-testid="guide-program"
            >
              <span className="guide-program-name">
                {at.clipped && <span aria-hidden="true">‹ </span>}
                {p.Name}
                {badge && <span className={`program-badge is-${badge.toLowerCase()}`}>{badge}</span>}
              </span>
              {episode && <span className="guide-program-episode">{episode}</span>}
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
