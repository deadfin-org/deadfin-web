import { useAuth } from '../../api/AuthContext';
import { describeServer } from '../../api/serverBuild';
import { useServerInfo } from '../../api/serverInfo';
import { describeWebBuild, webBuild } from '../../build';
import { PageHeader } from '../../ui/PageHeader';
import { FormSection } from '../../ui/Form';

/** Dashboard landing page: the server identity. */
export function DashboardHome() {
  const { session, api } = useAuth();
  const { info, identity } = useServerInfo(api!, session!.serverUrl);
  return (
    <>
      <PageHeader title="Dashboard" />
      <FormSection title="Server">
        <dl className="kv-list" data-testid="dashboard-server">
          <dt>Server name</dt>
          <dd>{info?.ServerName ?? '…'}</dd>
          <dt>Version</dt>
          <dd>{info?.Version ?? '…'}</dd>
          <dt>Build</dt>
          <dd>{identity ? describeServer(identity) : '…'}</dd>
          <dt>Web client</dt>
          <dd>{describeWebBuild(webBuild)}</dd>
          <dt>Address</dt>
          <dd>{session!.serverUrl}</dd>
        </dl>
      </FormSection>
    </>
  );
}
