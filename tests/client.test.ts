import { describe, expect, it } from 'vitest';
import { authorizationHeader, primaryBlurhash, primaryImageUrl } from '../src/api/client';
import { clientVersion, webBuild } from '../src/build';

describe('authorizationHeader', () => {
  it('builds the MediaBrowser scheme with identity fields', () => {
    const h = authorizationHeader({ deviceId: 'dev-1' });
    expect(h).toMatch(/^MediaBrowser /);
    expect(h).toContain('Client="Deadfin Web"');
    expect(h).toContain('DeviceId="dev-1"');
    expect(h).toContain('Version="');
    expect(h).not.toContain('Token=');
  });

  it('appends Token once authenticated', () => {
    const h = authorizationHeader({ deviceId: 'dev-1', token: 'tok-abc' });
    expect(h).toContain('Token="tok-abc"');
  });

  it('never lets a quote break the header grammar', () => {
    const h = authorizationHeader({ deviceId: 'a"b', token: 't"t' });
    expect(h).toContain('DeviceId="ab"');
    expect(h).toContain('Token="tt"');
  });
});

describe('authorizationHeader — injected build identity', () => {
  it('sets Version to the injected clientVersion', () => {
    const h = authorizationHeader({ deviceId: 'dev-1' });
    expect(h).toContain(`Version="${clientVersion(webBuild)}"`);
  });

  it('never contains a double quote or control character in Version', () => {
    const h = authorizationHeader({ deviceId: 'dev-1' });
    const m = h.match(/Version="([^"]*)"/);
    expect(m).not.toBeNull();
    const v = m![1];
    expect(v).not.toContain('"');
    // No C0 control chars or DEL
    expect(v).not.toMatch(/[\u0000-\u001f\u007f]/);
  });
});

describe('primaryImageUrl', () => {
  const item = { Id: 'i1', ImageTags: { Primary: 'tag9' } };

  it('builds the contract image path with tag and sizing', () => {
    const url = primaryImageUrl('http://srv:8096', item, 480);
    expect(url).toBe('http://srv:8096/Items/i1/Images/Primary?fillWidth=480&quality=90&tag=tag9');
  });

  it('is empty when the item has no primary image', () => {
    expect(primaryImageUrl('http://srv:8096', { Id: 'i1', ImageTags: {} })).toBe('');
    expect(primaryImageUrl('http://srv:8096', { ImageTags: { Primary: 't' } })).toBe('');
  });
});

describe('primaryBlurhash', () => {
  it('resolves the hash through the primary image tag', () => {
    const item = {
      ImageTags: { Primary: 'tagA' },
      ImageBlurHashes: { Primary: { tagA: 'LEHV6nWB2yk8' } },
    };
    expect(primaryBlurhash(item)).toBe('LEHV6nWB2yk8');
  });

  it('is undefined when tag and hashes do not line up', () => {
    expect(primaryBlurhash({ ImageTags: { Primary: 'tagA' }, ImageBlurHashes: { Primary: {} } })).toBeUndefined();
    expect(primaryBlurhash({ ImageTags: {}, ImageBlurHashes: { Primary: { t: 'h' } } })).toBeUndefined();
  });
});
