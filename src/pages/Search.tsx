import { useEffect, useState } from 'react';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import type { BaseItem } from '../api/library';
import { fetchSearchSuggestions, groupResults, SEARCH_PARTS } from '../api/search';
import { itemUrl } from '../routes/paths';
import { Shelf } from './library/Shelf';
import './home.css';
import './library.css';
import './search.css';

export function Search() {
  const { session, api } = useAuth();
  const [params, setParams] = useSearchParams();
  const term = (params.get('q') ?? '').trim();
  const [text, setText] = useState(params.get('q') ?? '');

  // Typing settles for a moment before it becomes the search (and the URL).
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== term) setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [text, term, setParams]);

  const parts = useQueries({
    queries: SEARCH_PARTS.map((p) => ({
      queryKey: ['search', p.key, session?.userId, term],
      enabled: !!api && !!session && term.length > 0,
      queryFn: () => p.run(api!, session!.userId, term),
      placeholderData: keepPreviousData,
    })),
  });

  if (!session || !api) return null;

  const answered = parts.filter((p) => p.data);
  const groups = groupResults(answered.flatMap((p) => p.data ?? []));
  const pending = parts.some((p) => p.isPending || p.isPlaceholderData);
  const failed = parts.every((p) => p.isError);

  return (
    <div className="home">
      <header className="page-bar library-bar">
        <input
          className="search-input"
          type="search"
          aria-label="Search"
          placeholder="Search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          spellCheck={false}
        />
      </header>

      <main className="home-main" data-testid="search-results">
        {!term ? (
          <Suggestions />
        ) : failed ? (
          <p className="home-status readout" role="alert">
            Search failed.
          </p>
        ) : groups.length === 0 && pending ? (
          <p className="home-status readout">Searching…</p>
        ) : groups.length === 0 ? (
          <p className="home-status readout" data-testid="search-empty">
            Sorry! No results found for “{term}”
          </p>
        ) : (
          groups.map((g) => (
            <Shelf
              key={g.label}
              title={
                <>
                  {g.label} <span className="readout">{g.items.length}</span>
                </>
              }
              items={g.items}
              serverUrl={session.serverUrl}
              testId="search-group"
            />
          ))
        )}
      </main>
    </div>
  );
}

/** jellyfin-web `SearchSuggestions`: a short list of names to try. */
function Suggestions() {
  const { session, api } = useAuth();
  const q = useQuery({
    queryKey: ['search-suggestions', session?.userId],
    enabled: !!api && !!session,
    staleTime: 5 * 60_000,
    queryFn: () => fetchSearchSuggestions(api!, session!.userId),
  });
  if (!q.data?.length) return null;
  return (
    <section className="search-suggestions" data-testid="search-suggestions">
      <h2 className="shelf-name">Suggestions</h2>
      <ul>
        {q.data.map((item: BaseItem) => (
          <li key={item.Id}>
            <Link to={itemUrl(item)}>{item.Name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
