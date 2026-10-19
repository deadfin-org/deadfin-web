import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApi } from '../src/api/client';
import { TunerGroupPicker } from '../src/pages/LiveTvGroups';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

function mount(loaded: boolean) {
  const saved: unknown[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url.endsWith('/deadfin/v1/livetv/tunerhosts/t1/groups')) {
      return json({ Groups: loaded ? [{ Name: 'News', Count: 9 }, { Name: 'Sports', Count: 2 }] : [], Loaded: loaded });
    }
    if (request.url.endsWith('/LiveTv/TunerHosts') && request.method === 'POST') {
      const body = await request.json();
      saved.push(body);
      return json(body);
    }
    return json({}, 404);
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TunerGroupPicker
        api={createApi('http://s', 'tok')}
        serverUrl="http://s"
        token="tok"
        tuner={{ Id: 't1', Type: 'm3u', Url: 'http://p/list.m3u', FriendlyName: 'IPTV', ExcludeGroups: ['sports'] }}
      />
    </QueryClientProvider>,
  );
  return saved;
}

describe('TunerGroupPicker', () => {
  it('shows the stored filter and saves a new one', async () => {
    const saved = mount(true);
    expect((await screen.findByTestId('kept-count')).textContent).toBe('keeps 9 of 11 channels');
    expect((screen.getByLabelText(/Sports/) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByLabelText('only checked'));
    fireEvent.click(screen.getByLabelText(/News/));
    expect(screen.getByTestId('kept-count').textContent).toBe('keeps 11 of 11 channels');
    fireEvent.click(screen.getByLabelText(/Sports/));
    expect(screen.getByTestId('kept-count').textContent).toBe('keeps 9 of 11 channels');

    fireEvent.click(screen.getByText('save and refresh guide'));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      Id: 't1',
      Type: 'm3u',
      Url: 'http://p/list.m3u',
      FriendlyName: 'IPTV',
      IncludeGroups: ['News'],
      ExcludeGroups: [],
    });
  });

  it('explains a playlist that is not loaded', async () => {
    mount(false);
    expect(await screen.findByText(/not loaded yet/)).toBeTruthy();
  });
});
