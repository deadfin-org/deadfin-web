import { describe, expect, it } from 'vitest';
import { mediaUrl } from '../src/api/mediaUrl';
import { subtitleUrl } from '../src/api/tracks';
import { transcodeUrl, type MediaSource } from '../src/api/playback';

const server = 'https://media.home.example/jf/';
const token = 'tok123';
const key = (u: string) => new URL(u).searchParams.get('api_key');

describe('mediaUrl', () => {
  it('resolves a relative path against the server and adds the token', () => {
    const u = mediaUrl(server, '/Videos/1/stream.webm?static=true', token);
    expect(u).toBe('https://media.home.example/jf/Videos/1/stream.webm?static=true&api_key=tok123');
  });
  it('adds the token to an absolute URL on the server origin', () => {
    expect(key(mediaUrl(server, 'https://media.home.example/jf/a.vtt', token))).toBe(token);
  });
  it('adds no token to another origin', () => {
    for (const other of [
      'https://attacker.example/sub.vtt',
      'http://media.home.example/jf/a.vtt', // scheme differs
      'https://media.home.example:8443/a.vtt', // port differs
    ]) {
      expect(mediaUrl(server, other, token)).not.toContain(token);
    }
  });
  it('adds no token when a relative path escapes to another host', () => {
    const u = mediaUrl('https://media.home.example', '@attacker.example/x.m3u8', token);
    expect(new URL(u).host).toBe('attacker.example');
    expect(u).not.toContain(token);
  });
  it('adds no token to a URL marked external, even on the server origin', () => {
    expect(mediaUrl(server, 'https://media.home.example/a.vtt', token, { external: true })).not.toContain(token);
  });
  it('keeps an api_key or ApiKey already present', () => {
    expect(key(mediaUrl(server, '/a.vtt?api_key=other', token))).toBe('other');
    const u = new URL(mediaUrl(server, '/a.vtt?ApiKey=other', token));
    expect(u.searchParams.get('ApiKey')).toBe('other');
    expect(u.searchParams.has('api_key')).toBe(false);
  });
});

const media = (sub: object): MediaSource =>
  ({ Id: 'ms1', MediaStreams: [{ Type: 'Subtitle', Index: 2, ...sub }] }) as MediaSource;

describe('subtitleUrl', () => {
  it('asks the server for WebVTT, with the token, when nothing is delivered', () => {
    const u = subtitleUrl(server, 'item1', media({}), 2, token);
    expect(u).toBe('https://media.home.example/jf/Videos/item1/ms1/Subtitles/2/0/Stream.vtt?api_key=tok123');
  });
  it('adds the token to a relative DeliveryUrl', () => {
    const u = subtitleUrl(server, 'item1', media({ DeliveryMethod: 'External', DeliveryUrl: '/Videos/x/Stream.vtt' }), 2, token);
    expect(key(u)).toBe(token);
  });
  it('adds the token to a same-origin absolute DeliveryUrl', () => {
    const d = 'https://media.home.example/jf/Videos/x/Stream.vtt';
    expect(key(subtitleUrl(server, 'item1', media({ DeliveryMethod: 'External', DeliveryUrl: d }), 2, token))).toBe(token);
  });
  it('sends no token to an other-origin DeliveryUrl', () => {
    const d = 'https://attacker.example/sub.vtt';
    expect(subtitleUrl(server, 'item1', media({ DeliveryMethod: 'External', DeliveryUrl: d }), 2, token)).toBe(d);
  });
  it('sends no token when the stream is IsExternalUrl, even if it looks same-origin', () => {
    const d = 'https://media.home.example/jf/sub.vtt';
    const m = media({ DeliveryMethod: 'External', DeliveryUrl: d, IsExternalUrl: true });
    expect(subtitleUrl(server, 'item1', m, 2, token)).toBe(d);
  });
  it('keeps an api_key already on the DeliveryUrl', () => {
    const m = media({ DeliveryMethod: 'External', DeliveryUrl: '/Videos/x/Stream.vtt?ApiKey=srv' });
    const u = new URL(subtitleUrl(server, 'item1', m, 2, token));
    expect(u.searchParams.get('ApiKey')).toBe('srv');
    expect(u.searchParams.has('api_key')).toBe(false);
  });
});

describe('transcodeUrl', () => {
  it('adds the token to the server-relative playlist', () => {
    const u = transcodeUrl(server, { TranscodingUrl: '/videos/1/master.m3u8?x=1' } as MediaSource, token);
    expect(u).toBe('https://media.home.example/jf/videos/1/master.m3u8?x=1&api_key=tok123');
  });
  it('sends no token to an absolute playlist on another origin', () => {
    const t = 'https://attacker.example/master.m3u8';
    expect(transcodeUrl(server, { TranscodingUrl: t } as MediaSource, token)).toBe(t);
  });
});
