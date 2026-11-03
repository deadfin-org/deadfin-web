import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Api } from '../../api/client';
import type { BaseItem } from '../../api/library';
import { fetchProgramSection, PROGRAM_SECTIONS, type ProgramSection } from '../../api/liveTv';
import { airedPercent, airTime, clock, episodeLine, isAiring, programBadge } from '../../api/programs';
import { detailsUrl } from '../../routes/paths';
import './livetv.css';

interface Ctx {
  api: Api;
  serverUrl: string;
  userId: string;
}

/**
 * The Programs tab, as jellyfin-web: On Now (recommended programmes on the
 * air), then upcoming Shows, Movies, Sports, For Kids and News. A row with
 * nothing in it is not shown.
 */
export function ProgramsTab({ ctx }: { ctx: Ctx }) {
  return (
    <div className="programs" data-testid="programs">
      {PROGRAM_SECTIONS.map((section) => (
        <ProgramRow key={section.key} ctx={ctx} section={section} />
      ))}
      <ProgramsEmpty ctx={ctx} />
    </div>
  );
}

function useSection(ctx: Ctx, section: ProgramSection) {
  return useQuery({
    queryKey: ['program-section', ctx.userId, section.key],
    staleTime: 60_000,
    queryFn: () => fetchProgramSection(ctx.api, ctx.userId, section),
  });
}

function ProgramRow({ ctx, section }: { ctx: Ctx; section: ProgramSection }) {
  const q = useSection(ctx, section);
  if (q.isError || (q.data && q.data.length === 0)) return null;
  const headingId = `programs-${section.key}`;
  return (
    <section className="shelf" data-testid="program-row" aria-labelledby={headingId}>
      <h2 className="shelf-head">
        <span className="shelf-name" id={headingId}>
          {section.title}
        </span>
      </h2>
      {q.data ? (
        <ul className="shelf-row program-row">
          {q.data.map((p) => (
            <li key={p.Id}>
              <ProgramCard serverUrl={ctx.serverUrl} program={p} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="shelf-row program-row" aria-busy="true" />
      )}
    </section>
  );
}

/** "No Items" once every row has loaded empty. */
function ProgramsEmpty({ ctx }: { ctx: Ctx }) {
  // PROGRAM_SECTIONS is fixed, so the hook count is too.
  const all = PROGRAM_SECTIONS.map((s) => useSection(ctx, s));
  if (!all.every((q) => q.isSuccess && q.data.length === 0)) return null;
  return (
    <p className="home-status readout" data-testid="library-empty">
      No Items are currently available.
    </p>
  );
}

function imageFor(serverUrl: string, p: BaseItem): string {
  const q = new URLSearchParams({ fillWidth: '400', quality: '90' });
  for (const type of ['Thumb', 'Primary'] as const) {
    const tag = p.ImageTags?.[type];
    if (p.Id && tag) {
      q.set('tag', tag);
      return `${serverUrl}/Items/${p.Id}/Images/${type}?${q}`;
    }
  }
  const backdrop = p.BackdropImageTags?.[0];
  if (p.Id && backdrop) {
    q.set('tag', backdrop);
    return `${serverUrl}/Items/${p.Id}/Images/Backdrop/0?${q}`;
  }
  return '';
}

/**
 * A programme card: its image (or its channel's logo), title, episode,
 * air time and channel, with a New, Live or Premiere badge. An airing
 * programme shows how far it is and when it ends.
 */
export function ProgramCard(props: { serverUrl: string; program: BaseItem; now?: Date }) {
  const p = props.program;
  const now = props.now ?? new Date();
  const image = imageFor(props.serverUrl, p);
  const logo =
    !image && p.ChannelId && p.ChannelPrimaryImageTag
      ? `${props.serverUrl}/Items/${p.ChannelId}/Images/Primary?${new URLSearchParams({ fillWidth: '200', quality: '90', tag: p.ChannelPrimaryImageTag })}`
      : '';
  const badge = programBadge(p);
  const episode = episodeLine(p);
  const airing = isAiring(p, now);
  const when = airing && p.EndDate ? `Ends ${clock(new Date(p.EndDate))}` : airTime(p, now);
  const channel = [p.ChannelNumber, p.ChannelName].filter(Boolean).join(' ');
  return (
    <Link to={detailsUrl(p.Id ?? '')} className="program-card" data-testid="program-card">
      <span className="program-frame">
        {image ? (
          <img src={image} alt="" loading="lazy" className="program-img" />
        ) : logo ? (
          <img src={logo} alt="" loading="lazy" className="program-logo" />
        ) : (
          <span className="poster-void readout">no signal</span>
        )}
        {badge && <span className={`program-badge is-${badge.toLowerCase()} is-overlay`}>{badge}</span>}
        {airing && (
          <span className="poster-progress" aria-hidden="true">
            <span style={{ width: `${airedPercent(p, now)}%` }} />
          </span>
        )}
      </span>
      <span className="program-title">{p.Name ?? 'Untitled'}</span>
      {episode && <span className="program-meta">{episode}</span>}
      <span className="program-meta readout">{when}</span>
      {channel && <span className="program-meta readout">{channel}</span>}
    </Link>
  );
}
