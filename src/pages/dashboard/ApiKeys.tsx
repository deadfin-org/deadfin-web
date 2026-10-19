import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import type { Api } from '../../api/client';
import { createApiKey, fetchApiKeys, revokeApiKey } from '../../api/admin/keys';
import { formatDateTime } from '../../lib/dateTime';
import { ConfirmDialog, InputDialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import '../../ui/table.css';

/** Dashboard → API Keys: list, create and revoke, as jellyfin-web. */
export function ApiKeys() {
  const { session, api } = useAuth();
  if (!session || !api) return null;
  return <ApiKeysTable api={api} serverUrl={session.serverUrl} />;
}

export function ApiKeysTable(props: { api: Api; serverUrl: string }) {
  const { api, serverUrl } = props;
  const queryClient = useQueryClient();
  const key = ['dashboard-api-keys', serverUrl];
  const keys = useQuery({ queryKey: key, queryFn: () => fetchApiKeys(api) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (app: string) => createApiKey(api, app),
    onSuccess: () => setCreateOpen(false),
    onSettled: refresh,
  });
  const revoke = useMutation({
    mutationFn: (token: string) => revokeApiKey(api, token),
    onSuccess: () => setPendingRevoke(null),
    onSettled: refresh,
  });

  return (
    <div data-testid="api-keys-page">
      <PageHeader title="API Keys" />
      <p className="form-help page-subtitle">
        External applications are required to have an API key in order to communicate with the server. Keys are issued by
        logging in with a normal user account or manually granting the application a key.
      </p>
      {keys.isError ? (
        <p className="form-error" role="alert">
          Failed to load API keys
        </p>
      ) : (
        <>
          <div className="table-toolbar">
            <button type="button" className="button-outline" onClick={() => setCreateOpen(true)}>
              <Icon name="add" />
              New API Key
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table" data-testid="api-keys-table">
              <thead>
                <tr>
                  <th>API Key</th>
                  <th>App</th>
                  <th>Date Issued</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(keys.data ?? []).map((k) => (
                  <tr key={k.AccessToken ?? k.Id} data-testid="api-key-row">
                    <td className="cell-mono">{k.AccessToken}</td>
                    <td>{k.AppName}</td>
                    <td className="cell-nowrap">{formatDateTime(k.DateCreated)}</td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="icon-button is-danger"
                        title="Revoke"
                        aria-label={`Revoke ${k.AppName ?? 'key'}`}
                        disabled={!k.AccessToken}
                        onClick={() => k.AccessToken && setPendingRevoke(k.AccessToken)}
                      >
                        <Icon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {keys.isPending && <p className="table-status">Loading…</p>}
            {keys.isSuccess && keys.data.length === 0 && <p className="table-status">No API keys.</p>}
          </div>
        </>
      )}
      <InputDialog
        open={createOpen}
        title="New API Key"
        label="App name"
        help="A human readable name for identifying API keys. This setting will not affect functionality."
        confirmText="Create"
        busy={create.isPending}
        error={create.isError ? create.error.message : null}
        onConfirm={(app) => create.mutate(app)}
        onClose={() => {
          setCreateOpen(false);
          create.reset();
        }}
      />
      <ConfirmDialog
        open={pendingRevoke !== null}
        title="Revoke API Key"
        text="Are you sure you wish to revoke this API key? The application's connection to this server will be abruptly ended."
        confirmText="Delete"
        busy={revoke.isPending}
        error={revoke.isError ? revoke.error.message : null}
        onConfirm={() => pendingRevoke && revoke.mutate(pendingRevoke)}
        onCancel={() => {
          setPendingRevoke(null);
          revoke.reset();
        }}
      />
    </div>
  );
}
