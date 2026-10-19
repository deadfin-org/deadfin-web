import { useState } from 'react';
import { describeWebBuild, webBuild } from '../build';
import { describeServer, type ServerIdentity } from '../api/serverBuild';
import './about.css';

/** Build identities and the server address, copyable for a bug report. */
export function About({ serverUrl, identity }: { serverUrl: string; identity?: ServerIdentity }) {
  const [copied, setCopied] = useState(false);
  const server = identity
    ? `${describeServer(identity)}${identity.revision ? ` (${identity.revision.slice(0, 8)})` : ''}`
    : '…';
  const lines = [
    `Web client: ${describeWebBuild(webBuild)} (${webBuild.commit})`,
    `Server: ${server}`,
    `Server address: ${serverUrl}`,
    `Browser: ${navigator.userAgent}`,
  ];
  const copy = () => {
    void navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <details className="about" data-testid="about">
      <summary role="menuitem">About</summary>
      <div className="about-panel">
        <dl className="about-list">
          <dt className="readout">Web client</dt>
          <dd data-testid="about-web">
            <WebBuildReadout />
          </dd>
          <dt className="readout">Server</dt>
          <dd data-testid="about-server">{server}</dd>
          <dt className="readout">Address</dt>
          <dd>{serverUrl}</dd>
        </dl>
        <button type="button" className="home-signout readout" onClick={copy}>
          {copied ? 'Copied' : 'Copy for a bug report'}
        </button>
      </div>
    </details>
  );
}

/** Web bundle build identity: the same object the auth Version header uses (issue #26). */
export function WebBuildReadout() {
  return (
    <span data-testid="web-build" title={webBuild.commit}>
      {describeWebBuild(webBuild)}
    </span>
  );
}
