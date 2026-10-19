import { useState } from 'react';
import type { components } from '../../api/schema';
import { CheckboxField, FormSection } from '../../ui/Form';
import {
  NumberField,
  SelectField,
  SettingsForm,
  TextField,
  joinList,
  saveNamedConfiguration,
  splitList,
  useSettings,
} from './settings';

type NetworkConfiguration = components['schemas']['NetworkConfiguration'];

export interface PublishedServerUris {
  all?: string;
  internal?: string;
  external?: string;
}

/** `PublishedServerUriBySubnet` as the page shows it, as jellyfin-web features/networking/utils.ts. */
export function getPublishedServerUris(uris: string[] | null | undefined): PublishedServerUris {
  const list = uris ?? [];
  if (list.length === 1 && !list[0]!.includes('=')) return { all: list[0] };
  const out: PublishedServerUris = {};
  for (const part of list) {
    const at = part.indexOf('=');
    const type = part.slice(0, at);
    if (type === 'all' || type === 'internal' || type === 'external') out[type] = part.slice(at + 1);
  }
  return out;
}

export function encodePublishedServerUris(uris: PublishedServerUris): string[] {
  if (uris.all) return [`all=${uris.all}`];
  const out: string[] = [];
  if (uris.internal) out.push(`internal=${uris.internal}`);
  if (uris.external) out.push(`external=${uris.external}`);
  return out;
}

const LIST_FIELDS = ['LocalNetworkAddresses', 'LocalNetworkSubnets', 'KnownProxies', 'RemoteIPFilter'] as const;
type ListField = (typeof LIST_FIELDS)[number];

/** Dashboard → Advanced → Networking (`#/dashboard/networking`). */
export function Networking() {
  // List and URI boxes keep their text until save, so a typed comma stays.
  const [lists, setLists] = useState<Partial<Record<ListField, string>>>({});
  const [uris, setUris] = useState<PublishedServerUris | null>(null);
  const [sameUri, setSameUri] = useState<boolean | null>(null);
  const { draft: c, set, query, mutation } = useSettings<NetworkConfiguration>('network', (api, d) => {
    const changes: NetworkConfiguration = { ...d };
    for (const f of LIST_FIELDS) if (lists[f] !== undefined) changes[f] = splitList(lists[f]!);
    if (uris !== null || sameUri !== null) {
      const u = shownUris();
      changes.PublishedServerUriBySubnet = encodePublishedServerUris(
        same() ? { all: u.all?.trim() } : { internal: u.internal?.trim(), external: u.external?.trim() },
      );
    }
    return saveNamedConfiguration<NetworkConfiguration>(api, 'network', changes);
  });
  const stored = getPublishedServerUris(c?.PublishedServerUriBySubnet);
  const shownUris = () => uris ?? stored;
  const same = () => sameUri ?? (c?.PublishedServerUriBySubnet?.length ? !!stored.all : true);
  const edit = () => mutation.reset();
  const list = (f: ListField) => lists[f] ?? joinList(c?.[f]);
  const setList = (f: ListField) => (v: string) => {
    edit();
    setLists((l) => ({ ...l, [f]: v }));
  };
  const setUri = (k: keyof PublishedServerUris) => (v: string) => {
    edit();
    setUris({ ...shownUris(), [k]: v });
  };
  const check = (name: keyof NetworkConfiguration, label: string, help?: string) => (
    <CheckboxField label={label} help={help} checked={!!c?.[name]} onChange={(on) => set({ [name]: on })} />
  );
  const port = (name: 'InternalHttpPort' | 'InternalHttpsPort' | 'PublicHttpPort' | 'PublicHttpsPort', label: string, help: string) => (
    <NumberField label={label} value={c?.[name]} onChange={(v) => set({ [name]: v ?? 0 })} min={0} max={65535} required help={help} />
  );

  return (
    <SettingsForm
      title="Networking"
      testId="networking-form"
      loadError="Failed to load networking settings"
      query={query}
      ready={!!c}
      mutation={mutation}
    >
      {c && (
        <>
          <FormSection title="Server Address Settings">
            {port('InternalHttpPort', 'Local HTTP port number', 'The TCP port number for the HTTP server.')}
            {check(
              'EnableHttps',
              'Enable HTTPS',
              'Listen on the configured HTTPS port. A valid certificate must also be supplied for this to take effect.',
            )}
            {port('InternalHttpsPort', 'Local HTTPS port number', 'The TCP port number for the HTTPS server.')}
            <TextField
              label="Base URL"
              value={c.BaseUrl}
              onChange={(v) => set({ BaseUrl: v })}
              help="Add a custom subdirectory to the server URL. For example: https://example.com/<baseurl>"
            />
            <TextField
              label="Bind to local network address"
              value={list('LocalNetworkAddresses')}
              onChange={setList('LocalNetworkAddresses')}
              help="Override the local IP address for the HTTP server. If left empty, the server will bind to all available addresses. Changing this value requires a restart."
            />
            <TextField
              label="LAN networks"
              value={list('LocalNetworkSubnets')}
              onChange={setList('LocalNetworkSubnets')}
              help="Comma separated list of IP addresses or IP/netmask entries for networks that will be considered on local network when enforcing bandwidth and remote access restrictions. If left blank, all RFC1918 addresses are considered local."
            />
            <TextField
              label="Known proxies"
              value={list('KnownProxies')}
              onChange={setList('KnownProxies')}
              help="Comma separated list of IP addresses or hostnames of known proxies used when connecting to the server. This is required to make proper use of 'X-Forwarded-For' headers. Requires a reboot after saving."
            />
          </FormSection>

          <FormSection title="HTTPS Settings">
            {check(
              'RequireHttps',
              'Require HTTPS',
              'If checked, the server will automatically redirect all requests over HTTP to HTTPS. This has no effect if the server is not listening on HTTPS.',
            )}
            <TextField
              label="Custom SSL certificate path"
              value={c.CertificatePath}
              onChange={(v) => set({ CertificatePath: v })}
              help="Path to a PKCS #12 file containing a certificate and private key to enable TLS support on a custom domain."
            />
            <TextField
              label="Certificate password"
              type="password"
              value={c.CertificatePassword}
              onChange={(v) => set({ CertificatePassword: v })}
              help="If your certificate requires a password, please enter it here."
            />
          </FormSection>

          <FormSection title="Remote Access Settings">
            {check('EnableRemoteAccess', 'Allow remote connections to this server', 'If unchecked, all remote connections will be blocked.')}
            <TextField
              label="Remote IP address filter"
              value={list('RemoteIPFilter')}
              onChange={setList('RemoteIPFilter')}
              help="Comma separated list of IP addresses or IP/netmask entries for networks that will be allowed to connect remotely. If left blank, all remote addresses will be allowed."
            />
            <SelectField
              label="Remote IP address filter mode"
              value={c.IsRemoteIPFilterBlacklist ? 'blacklist' : 'whitelist'}
              onChange={(v) => set({ IsRemoteIPFilterBlacklist: v === 'blacklist' })}
              options={[
                ['whitelist', 'Whitelist'],
                ['blacklist', 'Blacklist'],
              ]}
            />
            {port('PublicHttpPort', 'Public HTTP port number', 'The public port number that should be mapped to the local HTTP port.')}
            {port('PublicHttpsPort', 'Public HTTPS port number', 'The public port number that should be mapped to the local HTTPS port.')}
          </FormSection>

          <FormSection title="IP Protocols">
            {check('EnableIPv4', 'Enable IPv4', 'Enable IPv4 functionality.')}
            {check('EnableIPv6', 'Enable IPv6', 'Enable IPv6 functionality.')}
          </FormSection>

          <FormSection title="Network Discovery">
            {check(
              'AutoDiscovery',
              'Enable Auto Discovery',
              'Allow applications to automatically detect the server by using UDP port 7359.',
            )}
          </FormSection>

          <FormSection title="Firewall and Proxy Settings">
            <CheckboxField
              label="Use same published server URI for internal and external access"
              checked={same()}
              onChange={(on) => {
                edit();
                setSameUri(on);
              }}
            />
            {same() ? (
              <TextField
                label="Published Server URI"
                value={shownUris().all}
                onChange={setUri('all')}
                help="Override the URI used by the server, based on the interface, or client IP address."
              />
            ) : (
              <>
                <TextField
                  label="Internal URI"
                  value={shownUris().internal}
                  onChange={setUri('internal')}
                  help="Published server URI for internal access."
                />
                <TextField
                  label="External URI"
                  value={shownUris().external}
                  onChange={setUri('external')}
                  help="Published server URI for external access."
                />
              </>
            )}
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
