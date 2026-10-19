import type { ReactNode } from 'react';
import './ui.css';

/** Page title row; `actions` sit at the right (buttons such as Add or Save). */
export function PageHeader(props: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <h1 className="page-title">{props.title}</h1>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </div>
  );
}
