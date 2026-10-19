import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { primaryBlurhash, primaryImageUrl } from '../../api/client';
import { Poster } from '../../components/Poster';
import { thumbUrl, personImageUrl, chapterImageUrl, splitPeople } from '../../api/items';
import type { BaseItem } from '../../api/library';
import { episodeLabel } from '../../api/tv';
import { formatRuntime, formatTimecode, progressPercent, ticksToSeconds } from '../../lib/format';
import { detailsUrl, videoUrl } from '../../routes/paths';

/** A titled section of the details page (jellyfin-web `detailVerticalSection`). */
export function Section(props: { title: string; testId?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="detail-section" data-testid={props.testId}>
      <div className="detail-section-head">
        <h2 className="detail-section-title">{props.title}</h2>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

/** A horizontal row of cards. */
export function Scroller(props: { children: ReactNode; label: string }) {
  return (
    <div className="detail-scroller" role="list" aria-label={props.label}>
      {props.children}
    </div>
  );
}

/**
 * A 16:9 card: an episode, a special feature, a Next Up entry. It links to
 * the item, or plays it when `play` is set (special features, as jellyfin-web).
 */
export function WideCard(props: { serverUrl: string; item: BaseItem; play?: boolean; showSeries?: boolean; current?: boolean }) {
  const { item } = props;
  const img = thumbUrl(props.serverUrl, item);
  const pct = progressPercent(item.UserData?.PlaybackPositionTicks, item.RunTimeTicks);
  const label = item.Type === 'Episode' ? episodeLabel(item) : '';
  const title = props.showSeries && item.SeriesName ? item.SeriesName : item.Name;
  const sub = props.showSeries ? [label, item.Name].filter(Boolean).join(' - ') : label || formatRuntime(item.RunTimeTicks);
  const to = props.play ? videoUrl(item.Id ?? '') : detailsUrl(item.Id ?? '');
  return (
    <Link
      to={to}
      className={props.current ? 'wide-card is-current' : 'wide-card'}
      role="listitem"
      data-testid="wide-card"
      aria-current={props.current ? 'page' : undefined}
    >
      <span className="wide-card-img">
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="poster-void readout">{item.Name}</span>}
        {item.UserData?.Played && <span className="poster-played readout">✓</span>}
        {pct > 0 && !item.UserData?.Played && (
          <span className="poster-progress">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      <span className="wide-card-title">{title}</span>
      {sub && <span className="wide-card-sub readout">{sub}</span>}
    </Link>
  );
}

type Person = ReturnType<typeof splitPeople>['cast'][number] | NonNullable<BaseItem['People']>[number];

/** A Cast & Crew card: photo, name, role; links to the person's page. */
export function PersonCard(props: { serverUrl: string; person: Person }) {
  const { person } = props;
  const img = personImageUrl(props.serverUrl, person);
  const roles = 'roles' in person ? person.roles.join(', ') : person.Role || person.Type || '';
  const initials = (person.Name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  const body = (
    <>
      <span className="person-card-img">
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="person-card-initials" aria-hidden="true">{initials}</span>}
      </span>
      <span className="person-card-name">{person.Name}</span>
      {roles && <span className="person-card-role">{roles}</span>}
    </>
  );
  return person.Id ? (
    <Link to={detailsUrl(person.Id)} className="person-card" role="listitem" data-testid="person-card">
      {body}
    </Link>
  ) : (
    <span className="person-card" role="listitem" data-testid="person-card">
      {body}
    </span>
  );
}

/** A Scenes card: the chapter image; it plays from the chapter start. */
export function ChapterCard(props: {
  serverUrl: string;
  itemId: string;
  index: number;
  chapter: NonNullable<BaseItem['Chapters']>[number];
}) {
  const { chapter } = props;
  const img = chapter.ImageTag ? chapterImageUrl(props.serverUrl, props.itemId, props.index, chapter.ImageTag) : '';
  const at = chapter.StartPositionTicks ?? 0;
  return (
    <Link to={videoUrl(props.itemId, at)} className="wide-card" role="listitem" data-testid="chapter-card">
      <span className="wide-card-img">{img && <img src={img} alt="" loading="lazy" />}</span>
      <span className="wide-card-title">{chapter.Name}</span>
      <span className="wide-card-sub readout">{formatTimecode(ticksToSeconds(at))}</span>
    </Link>
  );
}

/** A season poster; a season with no art of its own wears its series' poster (jellyfin-web cardBuilder). */
export function SeasonCard(props: { serverUrl: string; season: BaseItem }) {
  const s = props.season;
  const own = primaryImageUrl(props.serverUrl, s);
  const img =
    own ||
    (s.SeriesId && s.SeriesPrimaryImageTag
      ? primaryImageUrl(props.serverUrl, { Id: s.SeriesId, ImageTags: { Primary: s.SeriesPrimaryImageTag } })
      : '');
  const unplayed = s.UserData?.UnplayedItemCount ?? 0;
  return (
    <Link to={detailsUrl(s.Id ?? '')} className="card-link scroller-card" role="listitem" data-testid="item-link">
      <Poster
        title={s.Name ?? ''}
        imageUrl={img}
        blurhash={own ? primaryBlurhash(s) : undefined}
        year={unplayed > 0 ? `${unplayed} unplayed` : null}
        played={s.UserData?.Played ?? false}
      />
    </Link>
  );
}
