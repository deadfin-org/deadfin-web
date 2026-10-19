import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import './dialog.css';

/**
 * A modal dialog on the native <dialog> element: Escape and the Cancel
 * button close it, focus stays inside while it is open.
 */
function Modal(props: { open: boolean; title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { open } = props;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      data-testid={props.testId}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className="dialog-title">
            {props.title}
          </h2>
          {props.children}
        </>
      )}
    </dialog>
  );
}

/** Yes/no question before a destructive action, as jellyfin-web's ConfirmDialog. */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  text: string;
  confirmText: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={props.open} title={props.title} onClose={props.onCancel} testId="confirm-dialog">
      <p className="dialog-text">{props.text}</p>
      {props.error && (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="button-text" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" className="button-danger" disabled={props.busy} onClick={props.onConfirm} autoFocus>
          {props.confirmText}
        </button>
      </div>
    </Modal>
  );
}

/** One text field and a confirm button, as jellyfin-web's InputDialog. */
export function InputDialog(props: {
  open: boolean;
  title: string;
  label: string;
  help?: string;
  confirmText: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const id = useId();
  useEffect(() => {
    if (props.open) setValue('');
  }, [props.open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) props.onConfirm(value);
  };
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose} testId="input-dialog">
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor={id}>{props.label}</label>
          <input id={id} value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
          {props.help && <p className="form-help">{props.help}</p>}
        </div>
        {props.error && (
          <p className="form-error" role="alert">
            {props.error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button-text" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={props.busy || !value.trim()}>
            {props.confirmText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
