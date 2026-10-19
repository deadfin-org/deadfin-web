import { useState } from 'react';
import { useAuth } from '../../api/AuthContext';
import { FolderPicker } from '../../components/LibraryForm';
import { Dialog } from '../../ui/Modal';
import { Field } from '../../ui/Form';
import '../../components/library-form.css';

/** The server folder browser in a dialog, as jellyfin-web's "Select Path". */
export function SelectPathDialog(props: { title?: string; start: string; onPick: (path: string) => void; onCancel: () => void }) {
  const { api } = useAuth();
  return (
    <Dialog title={props.title ?? 'Select Path'} onClose={props.onCancel} testId="select-path">
      <FolderPicker api={api!} start={props.start || '/'} onPick={props.onPick} />
    </Dialog>
  );
}

/** A path input with a browse button that opens the server folder browser. */
export function PathField(props: {
  label: string;
  help?: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  pickerTitle?: string;
}) {
  const [browsing, setBrowsing] = useState(false);
  return (
    <Field label={props.label} help={props.help}>
      {(id) => (
        <div className="path-field">
          <input id={id} name={props.name} value={props.value} onChange={(e) => props.onChange(e.target.value)} spellCheck={false} />
          <button type="button" className="button-plain" aria-label={`Browse for ${props.label}`} onClick={() => setBrowsing(true)}>
            Browse
          </button>
          {browsing && (
            <SelectPathDialog
              title={props.pickerTitle}
              start={props.value}
              onPick={(p) => {
                props.onChange(p);
                setBrowsing(false);
              }}
              onCancel={() => setBrowsing(false)}
            />
          )}
        </div>
      )}
    </Field>
  );
}
