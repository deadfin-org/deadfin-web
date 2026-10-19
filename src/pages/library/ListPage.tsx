import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import { fetchItem, fetchListPage, type ItemKind, type ListSource } from '../../api/library';
import { ItemCard } from '../../components/ItemCard';
import { useListState } from './listState';
import { StreamedGrid, useStreamedList } from './StreamedGrid';
import { Toolbar } from './Toolbar';
import '../home.css';
import '../library.css';

const TYPE_TITLES: Partial<Record<string, string>> = {
  Movie: 'Movies',
  Series: 'Shows',
  Episode: 'Episodes',
  MusicAlbum: 'Albums',
  Audio: 'Songs',
  MusicArtist: 'Artists',
  'Video,MusicVideo': 'Videos',
  BoxSet: 'Collections',
  Playlist: 'Playlists',
};

/**
 * jellyfin-web `#/list`: the items of a folder (`parentId`), a genre
 * (`genreId`), a studio (`studioId`), a tag, favorites of a type
 * (`type=Movie&IsFavorite=true`) or Next Up (`type=nextup`). Streamed as
 * every long list.
 */
export function ListPage() {
  const { session, api } = useAuth();
  const [params] = useSearchParams();
  const parentId = params.get('parentId');
  const genreId = params.get('genreId') ?? params.get('musicGenreId');
  const studioId = params.get('studioId');
  const rawType = params.get('type');
  const nextUp = rawType?.toLowerCase() === 'nextup';
  const tag = rawType === 'tag' ? params.get('tag') : null;
  const itemTypes = rawType && !nextUp && !tag ? (rawType.split(',') as ItemKind[]) : undefined;
  const favorites = params.get('IsFavorite') === 'true';
  // A plain folder lists its direct children; anything narrower searches below it.
  const recursive = !!(genreId || studioId || tag || itemTypes || favorites);
  const source: ListSource = nextUp ? 'nextUp' : itemTypes?.length === 1 && itemTypes[0] === 'MusicArtist' ? 'artists' : 'items';

  const [state, setState] = useListState('mixed');
  const titleId = genreId ?? studioId ?? parentId;
  const title = useQuery({
    queryKey: ['item', session?.userId, titleId],
    enabled: !!api && !!session && !!titleId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchItem(api!, session!.userId, titleId!),
  });
  const list = useStreamedList(
    ['list', session?.userId, parentId, genreId, studioId, rawType, tag, favorites, state],
    (startIndex, limit) =>
      fetchListPage(api!, source, {
        userId: session!.userId,
        parentId,
        itemTypes,
        recursive,
        sortBy: state.sortBy,
        descending: state.descending,
        filters: tag ? { ...state.filters, tags: [...state.filters.tags, tag] } : state.filters,
        letter: state.letter,
        isFavorite: favorites || undefined,
        genreIds: genreId ? [genreId] : undefined,
        studioIds: studioId ? [studioId] : undefined,
        startIndex,
        limit,
      }),
    !!api && !!session,
  );
  if (!session || !api) return null;

  const heading = nextUp
    ? 'Next Up'
    : tag
      ? tag
      : (title.data?.Name ?? (favorites && rawType ? `Favorites: ${TYPE_TITLES[rawType] ?? rawType}` : rawType ? (TYPE_TITLES[rawType] ?? rawType) : ''));

  return (
    <div className="home">
      <header className="page-bar library-bar">
        <h1 className="library-title">{heading || ' '}</h1>
      </header>
      <main className="home-main library-list">
        <Toolbar
          total={list.total}
          state={state}
          onChange={setState}
          sorts={nextUp ? undefined : 'mixed'}
          filters={nextUp ? undefined : ['status', 'values']}
          alphabet={!nextUp}
          parentId={parentId}
          itemTypes={itemTypes}
        />
        <StreamedGrid list={list} render={(item) => <ItemCard serverUrl={session.serverUrl} item={item} />} />
      </main>
    </div>
  );
}
