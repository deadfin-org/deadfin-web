import { useState } from 'react';
import { NumberField, SettingsForm, saveServerConfiguration, useSettings, type ServerConfiguration } from '../settings';

/** Mbps as the page shows it, from the stored bits per second; 0 (no limit) shows empty. */
export function toMbps(bps: number | null | undefined): number | null {
  return bps ? bps / 1e6 : null;
}

/** Bits per second from Mbps, as jellyfin-web: `Math.trunc(1e6 * Mbps)`. */
export function fromMbps(mbps: number | null): number {
  return Math.trunc(1e6 * (mbps ?? 0));
}

/** Dashboard → Playback → Streaming (`#/dashboard/playback/streaming`). */
export function Streaming() {
  // The box keeps what was typed (0.25 steps); undefined until the first edit.
  const [mbps, setMbps] = useState<number | null | undefined>(undefined);
  const { draft: c, query, mutation } = useSettings<ServerConfiguration>(null, (api, d) =>
    saveServerConfiguration(api, (stored) => ({
      ...stored,
      RemoteClientBitrateLimit: mbps === undefined ? d.RemoteClientBitrateLimit : fromMbps(mbps),
    })),
  );
  return (
    <SettingsForm
      title="Streaming"
      testId="streaming-form"
      loadError="Failed to load streaming page settings"
      query={query}
      ready={!!c}
      mutation={mutation}
    >
      {c && (
        <div className="form-section">
          <NumberField
            label="Internet streaming bitrate limit (Mbps)"
            value={mbps === undefined ? toMbps(c.RemoteClientBitrateLimit) : mbps}
            onChange={(v) => {
              mutation.reset();
              setMbps(v);
            }}
            min={0}
            max={2147.25}
            step={0.25}
            help="An optional per-stream bitrate limit for all out of network devices. This is useful to prevent devices from requesting a higher bitrate than your internet connection can handle. This may result in increased CPU load on your server in order to transcode videos on the fly to a lower bitrate."
          />
        </div>
      )}
    </SettingsForm>
  );
}
