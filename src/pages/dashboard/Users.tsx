import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/AuthContext';
import { deleteUser, fetchUsers, lastSeen, type UserDto } from '../../api/admin/users';
import { ConfirmDialog } from '../../ui/Modal';
import { PageHeader } from '../../ui/PageHeader';
import { StreamedList } from '../../ui/StreamedList';
import './dashboard.css';

/** User cards with Add User, as jellyfin-web `#/dashboard/users`. */
export function Users() {
  const { api, session } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => fetchUsers(api!) });
  const [deleting, setDeleting] = useState<UserDto | null>(null);
  const remove = useMutation({
    mutationFn: (u: UserDto) => deleteUser(api!, u.Id!),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
  const saved = (location.state as { saved?: boolean } | null)?.saved;
  const sorted = [...(users.data ?? [])].sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
  return (
    <>
      <PageHeader
        title="Users"
        actions={
          <Link to="/dashboard/users/add" className="button-primary" data-testid="add-user">
            + Add User
          </Link>
        }
      />
      {saved && (
        <p role="status" className="dash-toast">
          Settings saved.
        </p>
      )}
      {users.isError ? (
        <p className="form-error" role="alert">
          {users.error.message}
        </p>
      ) : !users.data ? (
        <p className="form-help">Loading…</p>
      ) : (
        <StreamedList
          className="user-cards"
          testId="user-cards"
          items={sorted}
          render={(u) => (
            <UserCard key={u.Id} user={u} serverUrl={session!.serverUrl} onDelete={() => setDeleting(u)} />
          )}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.Name}`}
          text="Are you sure you wish to delete this user?"
          confirmText="Delete"
          danger
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => {
            setDeleting(null);
            remove.reset();
          }}
        />
      )}
    </>
  );
}

function UserCard({ user, serverUrl, onDelete }: { user: UserDto; serverUrl: string; onDelete: () => void }) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  const img = user.PrimaryImageTag
    ? `${serverUrl}/Users/${user.Id}/Images/Primary?width=300&tag=${user.PrimaryImageTag}&quality=90`
    : '';
  const disabled = !!user.Policy?.IsDisabled;
  const go = (tab: string) => navigate(`/dashboard/users/${user.Id}/${tab}`);
  return (
    <div className={disabled ? 'user-card is-disabled' : 'user-card'} data-testid="user-card">
      <Link to={`/dashboard/users/${user.Id}/profile`} className="user-card-image" aria-label={user.Name ?? ''}>
        {img ? <img src={img} alt="" loading="lazy" /> : <span aria-hidden="true">{(user.Name ?? '?').slice(0, 1).toUpperCase()}</span>}
      </Link>
      <div className="user-card-footer">
        <div className="user-card-text">
          <div className="user-card-name">{user.Name}</div>
          <div className="form-help">{lastSeen(user.LastActivityDate)}</div>
        </div>
        <div className="user-card-menu" ref={menuRef}>
          <button
            type="button"
            className="modal-close"
            aria-label={`Menu for ${user.Name}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            ⋮
          </button>
          {menu && (
            <div className="card-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => go('profile')}>
                Edit user
              </button>
              <button type="button" role="menuitem" onClick={() => go('access')}>
                Library access
              </button>
              <button type="button" role="menuitem" onClick={() => go('parentalcontrol')}>
                Parental control
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
