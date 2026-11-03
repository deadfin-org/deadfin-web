import { describe, expect, it } from 'vitest';
import {
  airedPercent,
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
} from '../src/api/programs';
import { primaryMediaInfo } from '../src/api/items';
import { PROGRAM_SECTIONS } from '../src/api/liveTv';

const at = (h: number, m = 0, day = 3) => new Date(2026, 10, day, h, m);
const iso = (d: Date) => d.toISOString();

describe('guide window', () => {
  it('opens today at the current half hour and other days at midnight, 24 h wide', () => {
    const now = at(20, 47);
    expect(guideWindow(now, now)).toEqual({ start: at(20, 30), end: at(20, 30, 4) });
    expect(guideWindow(at(9, 12), at(9, 12)).start).toEqual(at(9, 0));
    expect(guideWindow(at(0, 0, 5), now)).toEqual({ start: at(0, 0, 5), end: at(0, 0, 6) });
  });

  it('has 48 half-hour slots', () => {
    const w = guideWindow(at(0, 0, 5), at(10));
    const slots = timeSlots(w.start, w.end);
    expect(slots).toHaveLength(48);
    expect(slots[1]).toEqual(at(0, 30, 5));
  });

  it('offers today up to the guide end, at most 14 days, or 7 without an end', () => {
    const now = at(10);
    expect(guideDays(at(23, 0, 5), now).map((d) => d.label.split(',')[0])).toEqual(['Today', 'Tomorrow', expect.any(String)]);
    expect(guideDays(at(0, 0, 30), now)).toHaveLength(14);
    expect(guideDays(null, now)).toHaveLength(7);
    // A guide that ended before today still offers today.
    expect(guideDays(at(0, 0, 1), now).map((d) => d.label)).toEqual(['Today']);
  });

  it('round-trips the ?day= value and rejects junk', () => {
    expect(dayValue(at(10, 0, 5))).toBe('2026-11-05');
    expect(parseDay('2026-11-05')).toEqual(at(0, 0, 5));
    expect(parseDay('tomorrow')).toBeNull();
    expect(parseDay(null)).toBeNull();
  });
});

describe('programme placement', () => {
  const win = { start: at(20), end: at(20, 0, 4) };
  const p = (s: Date, e: Date) => ({ StartDate: iso(s), EndDate: iso(e) });

  it('places a programme as fractions of the window', () => {
    expect(placeProgram(p(at(21), at(21, 30)), win.start, win.end)).toEqual({ left: 1 / 24, width: 1 / 48, clipped: false });
  });

  it('clips a programme that began before the window', () => {
    expect(placeProgram(p(at(19, 30), at(20, 30)), win.start, win.end)).toEqual({ left: 0, width: 1 / 48, clipped: true });
  });

  it('drops programmes outside the window, touching its edges, or without times', () => {
    expect(placeProgram(p(at(19), at(20)), win.start, win.end)).toBeNull();
    expect(placeProgram(p(at(20, 0, 4), at(21, 0, 4)), win.start, win.end)).toBeNull();
    expect(placeProgram({ StartDate: null, EndDate: null }, win.start, win.end)).toBeNull();
  });

  it('knows what is on now and how far it is', () => {
    const show = p(at(20), at(21));
    expect(isAiring(show, at(20, 30))).toBe(true);
    expect(isAiring(show, at(21))).toBe(false);
    expect(airedPercent(show, at(20, 15))).toBe(25);
  });
});

describe('programme text', () => {
  it('badges as jellyfin-web: Live, then Premiere, then New for a first-run series', () => {
    expect(programBadge({ IsLive: true, IsPremiere: true })).toBe('Live');
    expect(programBadge({ IsPremiere: true, IsSeries: true })).toBe('Premiere');
    expect(programBadge({ IsSeries: true })).toBe('New');
    expect(programBadge({ IsSeries: true, IsRepeat: true })).toBeNull();
    expect(programBadge({})).toBeNull();
  });

  it('shows season, episode and episode title when the guide has them (deadfin#730)', () => {
    expect(episodeLine({ ParentIndexNumber: 7, IndexNumber: 17, EpisodeTitle: 'The Doll' })).toBe('S7:E17 · The Doll');
    expect(episodeLine({ EpisodeTitle: 'The Doll' })).toBe('The Doll');
    expect(episodeLine({ ParentIndexNumber: 7, IndexNumber: 17 })).toBe('S7:E17');
    // A season alone is not an episode.
    expect(episodeLine({ ParentIndexNumber: 7 })).toBe('');
  });

  it('names a guide cell for screen readers', () => {
    const label = programLabel(
      { Name: 'Seinfeld', MediaType: 'Video', ParentIndexNumber: 7, IndexNumber: 17, EpisodeTitle: 'The Doll', IsSeries: true, StartDate: iso(at(20)), EndDate: iso(at(20, 30)) },
      at(20, 10),
    );
    expect(label).toMatch(/^Seinfeld, S7:E17 · The Doll, .+ – .+, New, On now$/);
  });

  it('gives a programme details page its air time, episode, channel and badge', () => {
    const info = primaryMediaInfo(
      {
        Type: 'Program',
        StartDate: iso(at(20)),
        EndDate: iso(at(20, 30)),
        ParentIndexNumber: 7,
        IndexNumber: 17,
        EpisodeTitle: 'The Doll',
        ChannelNumber: '4',
        ChannelName: 'WNBC',
        IsSeries: true,
        RunTimeTicks: 18_000_000_000,
        MediaType: 'Video',
      },
      at(19),
    );
    expect(info.map((m) => m.key)).toEqual(['air', 'episode', 'channel', 'badge']);
    expect(info[0]!.text).toMatch(/^Today /);
    expect(info.slice(1).map((m) => m.text)).toEqual(['S7:E17 · The Doll', '4 WNBC', 'New']);
  });
});

describe('program sections', () => {
  it('are jellyfin-web 12.0 Programs rows, in order', () => {
    expect(PROGRAM_SECTIONS.map((s) => s.title)).toEqual(['On Now', 'Shows', 'Movies', 'Sports', 'For Kids', 'News']);
    expect(PROGRAM_SECTIONS[1]!.query).toEqual({ hasAired: false, isMovie: false, isSports: false, isKids: false, isNews: false, isSeries: true });
  });
});
