import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';
import './modal.css';

/** Open dialogs, newest last: Escape closes only the top one. */
const stack: object[] = [];

/**
 * A modal dialog: title, body, and an action row. Escape and the backdrop
 * close it; focus moves into it on open and back to the opener on close.
 * It renders into document.body, so a dialog opened from inside a form can
 * hold its own form; its submit events stop at the dialog.
 */
export function Dialog(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // Callers pass inline handlers; read the newest one so the effect runs once.
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const onClose = () => close.current();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close)');
    (first ?? box.current)?.focus();
    const me = {};
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) {
        e.stopPropagation();
        close.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      stack.splice(stack.indexOf(me), 1);
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div
        ref={box}
        className={props.wide ? 'modal is-wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={props.testId}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {props.title}
          </h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.actions && <div className="modal-actions">{props.actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Yes/no question with a destructive or plain confirm button. */
export function ConfirmDialog(props: {
  title: string;
  text: ReactNode;
  confirmText: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title={props.title}
      onClose={props.onCancel}
      actions={
        <>
          <button type="button" className="button-plain" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={props.danger ? 'button-alarm' : 'button-primary'}
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.confirmText}
          </button>
        </>
      }
    >
      <div className="modal-text">{props.text}</div>
      {props.error && (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      )}
    </Dialog>
  );
}

/** One text field and a confirm button, as jellyfin-web's InputDialog (rename). */
export function InputDialog(props: {
  title: string;
  label: string;
  help?: string;
  initial?: string;
  confirmText: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) props.onConfirm(value.trim());
  };
  return (
    <Dialog title={props.title} onClose={props.onCancel}>
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor={id}>{props.label}</label>
          <input id={id} value={value} onChange={(e) => setValue(e.target.value)} required />
          {props.help && <p className="form-help">{props.help}</p>}
        </div>
        {props.error && (
          <p className="form-error" role="alert">
            {props.error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={props.busy || !value.trim()}>
            {props.confirmText}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
