import { useState, type FormEvent } from 'react';
import { GUIDE_CATEGORIES, type GuideCategory, type GuideIndicator, type GuideSettings } from '../../api/guideSettings';
import { CheckboxField, FormSection } from '../../ui/Form';
import { Dialog } from '../../ui/Modal';

const INDICATORS: { key: GuideIndicator; label: string }[] = [
  { key: 'hd', label: 'HD programs' },
  { key: 'live', label: 'Live broadcasts' },
  { key: 'new', label: 'New episodes' },
  { key: 'premiere', label: 'Premieres' },
  { key: 'repeat', label: 'Repeat episodes' },
];

/**
 * The guide's Settings dialog, as jellyfin-web `guide-settings`: channel
 * order, favourites first, indicators and colour-coded backgrounds (saved
 * with the user's display preferences), and the categories shown (for this
 * visit only, as jellyfin-web).
 */
export function GuideSettingsDialog(props: {
  settings: GuideSettings;
  categories: GuideCategory[];
  busy?: boolean;
  error?: string | null;
  onSave: (settings: GuideSettings, categories: GuideCategory[]) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(props.settings);
  // No category picked means all of them.
  const [picked, setPicked] = useState<GuideCategory[]>(props.categories.length ? props.categories : GUIDE_CATEGORIES.map((c) => c.key));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSave(s, picked.length === GUIDE_CATEGORIES.length ? [] : picked);
  };
  return (
    <Dialog
      title="Settings"
      onClose={props.onClose}
      testId="guide-settings"
      actions={
        <>
          {props.error && (
            <span className="form-error" role="alert">
              {props.error}
            </span>
          )}
          <button type="button" className="button-plain" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" form="guide-settings-form" className="button-primary" disabled={props.busy}>
            {props.busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="guide-settings-form" onSubmit={submit}>
        <FormSection title="Sort channels by">
          <div className="form-field" role="radiogroup" aria-label="Sort channels by">
            {(
              [
                ['Number', 'Channel number'],
                ['DatePlayed', 'Recently watched'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="form-check">
                <input type="radio" name="channelOrder" checked={s.channelOrder === value} onChange={() => setS({ ...s, channelOrder: value })} />
                {label}
              </label>
            ))}
          </div>
          <CheckboxField
            label="Place favorite channels at the beginning"
            checked={s.favoritesAtTop}
            onChange={(on) => setS({ ...s, favoritesAtTop: on })}
          />
        </FormSection>
        <FormSection title="Show indicators for">
          {INDICATORS.map((i) => (
            <CheckboxField
              key={i.key}
              label={i.label}
              checked={s.indicators[i.key]}
              onChange={(on) => setS({ ...s, indicators: { ...s.indicators, [i.key]: on } })}
            />
          ))}
          <CheckboxField label="Color coded backgrounds" checked={s.colorCoded} onChange={(on) => setS({ ...s, colorCoded: on })} />
        </FormSection>
        <FormSection title="Categories">
          {GUIDE_CATEGORIES.map((c) => (
            <CheckboxField
              key={c.key}
              label={c.label}
              checked={picked.includes(c.key)}
              onChange={(on) => setPicked(on ? [...picked, c.key] : picked.filter((k) => k !== c.key))}
            />
          ))}
        </FormSection>
      </form>
    </Dialog>
  );
}
