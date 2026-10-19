import { useId, type ReactNode } from 'react';
import './ui.css';

/** A titled block of settings, as the jellyfin-web dashboard `verticalSection`. */
export function FormSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <h2 className="form-section-title">{props.title}</h2>
      {props.children}
    </section>
  );
}

/** A labelled control with an optional help line under it. */
export function Field(props: { label: string; help?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{props.label}</label>
      {props.children(id)}
      {props.help && <p className="form-help">{props.help}</p>}
    </div>
  );
}

/** A checkbox with its label at the right and an optional help line. */
export function CheckboxField(props: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  help?: ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-check">
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        {props.label}
      </label>
      {props.help && <p className="form-help">{props.help}</p>}
    </div>
  );
}

/** Save button row at the end of a settings form; shows the result of the last save. */
export function SaveBar(props: { busy: boolean; error?: string | null; saved?: boolean }) {
  return (
    <div className="save-bar">
      <button type="submit" className="button-primary" disabled={props.busy}>
        {props.busy ? 'Saving…' : 'Save'}
      </button>
      {props.error && (
        <span className="form-error" role="alert">
          {props.error}
        </span>
      )}
      {props.saved && !props.error && <span role="status">Settings saved.</span>}
    </div>
  );
}
