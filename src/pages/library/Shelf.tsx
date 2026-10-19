import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BaseItem } from '../../api/library';
import { ItemCard } from '../../components/ItemCard';

/**
 * One titled row of cards (home sections, suggestions). It scrolls
 * sideways, as jellyfin-web's `emby-scroller`. An empty row is not shown.
 */
export function Shelf(props: {
  title: ReactNode;
  to?: string;
  items?: BaseItem[];
  pending?: boolean;
  serverUrl: string;
  extra?: ReactNode;
  testId?: string;
  cardTo?: (item: BaseItem) => string;
}) {
  const { items, pending } = props;
  if (!pending && (!items || items.length === 0) && !props.extra) return null;
  return (
    <section className="shelf" data-testid={props.testId ?? 'shelf'}>
      <h2 className="shelf-head">
        {props.to ? (
          <Link to={props.to} className="shelf-name shelf-name-link" data-testid="shelf-link">
            {props.title} <span aria-hidden="true">›</span>
          </Link>
        ) : (
          <span className="shelf-name">{props.title}</span>
        )}
      </h2>
      {props.extra}
      {pending ? (
        <div className="shelf-row" aria-busy="true" />
      ) : (
        items &&
        items.length > 0 && (
          <div className="shelf-row">
            {items.map((item) => (
              <ItemCard key={item.Id} serverUrl={props.serverUrl} item={item} to={props.cardTo?.(item)} />
            ))}
          </div>
        )
      )}
    </section>
  );
}
