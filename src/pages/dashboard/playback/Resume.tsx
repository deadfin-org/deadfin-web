import { NumberField, SettingsForm, saveServerConfiguration, useSettings, type ServerConfiguration } from '../settings';

type ResumeFields = Pick<
  ServerConfiguration,
  'MinResumePct' | 'MaxResumePct' | 'MinAudiobookResume' | 'MaxAudiobookResume' | 'MinResumeDurationSeconds'
>;

/** Dashboard → Playback → Resume (`#/dashboard/playback/resume`). */
export function Resume() {
  const { draft: c, set, query, mutation } = useSettings<ServerConfiguration>(null, (api, d) =>
    saveServerConfiguration(api, (stored) => ({
      ...stored,
      MinResumePct: d.MinResumePct,
      MaxResumePct: d.MaxResumePct,
      MinAudiobookResume: d.MinAudiobookResume,
      MaxAudiobookResume: d.MaxAudiobookResume,
      MinResumeDurationSeconds: d.MinResumeDurationSeconds,
    })),
  );
  const num = (name: keyof ResumeFields) => (v: number | null) => set({ [name]: v ?? 0 });
  return (
    <SettingsForm
      title="Resume"
      testId="resume-form"
      loadError="Failed to load resume settings"
      query={query}
      ready={!!c}
      mutation={mutation}
    >
      {c && (
        <div className="form-section">
          <NumberField
            label="Minimum resume percentage"
            value={c.MinResumePct}
            onChange={num('MinResumePct')}
            min={0}
            max={100}
            required
            help="Titles are assumed unplayed if stopped before this time."
          />
          <NumberField
            label="Maximum resume percentage"
            value={c.MaxResumePct}
            onChange={num('MaxResumePct')}
            min={1}
            max={100}
            required
            help="Titles are assumed fully played if stopped after this time."
          />
          <NumberField
            label="Minimum Audiobook resume in minutes"
            value={c.MinAudiobookResume}
            onChange={num('MinAudiobookResume')}
            min={0}
            max={100}
            required
            help="Titles are assumed unplayed if stopped before this time."
          />
          <NumberField
            label="Audiobook remaining minutes to resume"
            value={c.MaxAudiobookResume}
            onChange={num('MaxAudiobookResume')}
            min={1}
            max={100}
            required
            help="Titles are assumed fully played if stopped when the remaining duration is less than this value."
          />
          <NumberField
            label="Minimum resume duration"
            value={c.MinResumeDurationSeconds}
            onChange={num('MinResumeDurationSeconds')}
            min={0}
            required
            help="The shortest video length in seconds that will save playback location and let you resume."
          />
        </div>
      )}
    </SettingsForm>
  );
}
