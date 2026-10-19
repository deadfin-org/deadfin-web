import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Api } from '../../api/client';
import { deleteItem, downloadUrl, itemCommands, type CommandId } from '../../api/items';
import type { BaseItem } from '../../api/library';
import type { components } from '../../api/schema';
import { detailsUrl, paths } from '../../routes/paths';
import { AddToCollectionDialog, AddToPlaylistDialog, DeleteDialog, MediaInfoDialog, RefreshDialog } from './dialogs';
import { Icon } from './icons';

type User = components['schemas']['UserDto'];

/** Where to go after a delete: the season or series it was in, else Home. */
function afterDelete(item: BaseItem): string {
  if (item.Type === 'Episode' && item.SeasonId) return detailsUrl(item.SeasonId);
  if (item.Type === 'Season' && item.SeriesId) return detailsUrl(item.SeriesId);
  return paths.home;
}

/**
 * The More (…) button and its menu, as jellyfin-web `btnMoreCommands`:
 * hidden when no command applies to this item and user.
 */
export function MoreMenu(props: {
  api: Api;
  serverUrl: string;
  token: string;
  userId: string;
  user: User;
  item: BaseItem;
  toast: (message: string) => void;
}) {
  const { api, item } = props;
  const commands = itemCommands(item, props.user);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<CommandId | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const del = useMutation({
    mutationFn: () => deleteItem(api, item.Id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      navigate(afterDelete(item), { replace: true });
    },
  });

  if (commands.length === 0) return null;

  const run = (id: CommandId) => {
    setOpen(false);
    button.current?.focus();
    const url = downloadUrl(props.serverUrl, item.Id ?? '', props.token);
    if (id === 'download') {
      const a = document.createElement('a');
      a.href = url;
      a.download = (item.Path ?? '').replace(/^.*[\\/]/, '') || (item.Name ?? 'download');
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (id === 'copy-stream') {
      const fallback = () => window.prompt('Copy Stream URL', url);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => props.toast('URL copied successfully.'), fallback);
      } else fallback();
      return;
    }
    setDialog(id);
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let to: number | null = null;
    if (e.key === 'ArrowDown') to = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') to = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = items.length - 1;
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') button.current?.focus();
      return;
    }
    if (to === null) return;
    e.preventDefault();
    items[to]?.focus();
  };

  const done = (message: string, openId?: string) => {
    setDialog(null);
    if (message) props.toast(message);
    void queryClient.invalidateQueries({ queryKey: ['collections'] });
    void queryClient.invalidateQueries({ queryKey: ['editable-playlists'] });
    void queryClient.invalidateQueries({ queryKey: ['user-views'] });
    if (openId) navigate(detailsUrl(openId));
  };
  const close = () => {
    setDialog(null);
    button.current?.focus();
  };

  return (
    <div className="more-menu">
      <button
        ref={button}
        type="button"
        className="detail-button"
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="action-more"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div ref={menu} className="more-menu-list" role="menu" aria-label="More" onKeyDown={onMenuKey} data-testid="more-menu">
          {commands.map((c) => (
            <button key={c.id} type="button" role="menuitem" tabIndex={-1} onClick={() => run(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {dialog === 'addtocollection' && (
        <AddToCollectionDialog api={api} userId={props.userId} item={item} onClose={close} onDone={done} />
      )}
      {dialog === 'addtoplaylist' && (
        <AddToPlaylistDialog api={api} userId={props.userId} item={item} onClose={close} onDone={done} />
      )}
      {dialog === 'refresh' && <RefreshDialog api={api} item={item} onClose={close} onDone={done} />}
      {dialog === 'moremediainfo' && <MediaInfoDialog item={item} onClose={close} />}
      {dialog === 'delete' && (
        <DeleteDialog item={item} busy={del.isPending} error={del.error} onConfirm={() => del.mutate()} onClose={close} />
      )}
    </div>
  );
}
