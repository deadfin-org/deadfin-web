import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { fetchSearch } from '../api/search';
import { ItemCard } from '../components/ItemCard';
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

  const results = useQuery({
    queryKey: ['search', session?.userId, term],
    enabled: !!api && !!session && term.length > 0,
    queryFn: () => fetchSearch(api!, session!.userId, term),
    placeholderData: keepPreviousData,
  });

  if (!session || !api) return null;

  return (
    <div className="home">
      <header className="home-bar library-bar">
        <Link to="/" className="library-back readout">
          ← home
        </Link>
        <input
          className="search-input"
          type="search"
          aria-label="Search"
          placeholder="Search movies, shows, music…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          spellCheck={false}
        />
      </header>

      <main className="home-main" data-testid="search-results">
        {!term ? null : results.isError ? (
          <p className="home-status readout" role="alert">
            ▲ search failed
          </p>
        ) : !results.data ? (
          <p className="home-status readout">searching…</p>
        ) : results.data.length === 0 ? (
          <p className="home-status readout" data-testid="search-empty">
            nothing matches “{term}”
          </p>
        ) : (
          results.data.map((g) => (
            <section key={g.type} className="shelf" data-testid="search-group">
              <h2 className="shelf-head">
                <span className="shelf-name">{g.label}</span>
                <span className="readout">{g.items.length}</span>
              </h2>
              <div className="shelf-grid">
                {g.items.map((item) => (
                  <ItemCard key={item.Id} serverUrl={session.serverUrl} item={item} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
