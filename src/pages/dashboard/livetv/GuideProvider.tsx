import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../api/AuthContext';
import type { Api } from '../../../api/client';
import {
  displayUrl,
  fetchDefaultListingProvider,
  fetchLineups,
  fetchLiveTvOptions,
  fetchSchedulesDirectCountries,
  saveListingProvider,
  tunerTypeName,
  type ListingsProvider,
  type TunerHost,
} from '../../../api/liveTv';
import { CheckboxField, FormSection } from '../../../ui/Form';
import { PageHeader } from '../../../ui/PageHeader';
import { SelectField, TextField } from '../settings';
import '../settings.css';
import './livetv.css';

/** XMLTV categories are separated with '|'. */
export function joinCategories(list: string[] | null | undefined): string {
  return (list ?? []).join('|');
}

export function splitCategories(text: string): string[] {
  return text ? text.split('|') : [];
}

/**
 * Dashboard → Live TV → guide provider (`#/dashboard/livetv/guide?type=&id=`),
 * as jellyfin-web livetvguideprovider with components/tvproviders.
 */
export function GuideProvider() {
  const { api, session } = useAuth();
  const [params] = useSearchParams();
  const type = params.get('type')?.toLowerCase();
  const id = params.get('id');
  const options = useQuery({
    queryKey: ['livetv-options', session?.serverUrl],
    enabled: !!api,
    queryFn: () => fetchLiveTvOptions(api!),
  });
  const defaults = useQuery({
    queryKey: ['livetv-provider-default', session?.serverUrl],
    enabled: !!api && !id,
    queryFn: () => fetchDefaultListingProvider(api!),
  });
  if (!api || !session) return null;
  const stored = id ? options.data?.ListingProviders?.find((p) => p.Id === id) : undefined;
  const start = id ? stored : defaults.data;
  const error = options.error ?? defaults.error;

  return (
    <>
      <PageHeader title={type === 'schedulesdirect' ? 'Schedules Direct' : 'XMLTV'} />
      {type !== 'xmltv' && type !== 'schedulesdirect' ? (
        <p className="form-error" role="alert">
          Unknown guide provider type. <Link to="/dashboard/livetv">Back to Live TV</Link>
        </p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      ) : id && options.data && !stored ? (
        <p className="form-error" role="alert">
          No guide provider has this id. <Link to="/dashboard/livetv">Back to Live TV</Link>
        </p>
      ) : !options.data || !start ? (
        <p className="readout">Loading…</p>
      ) : type === 'xmltv' ? (
        <XmlTvForm api={api} start={start} id={id} tuners={options.data.TunerHosts ?? []} />
      ) : (
        <SchedulesDirectForm api={api} start={start} id={id} tuners={options.data.TunerHosts ?? []} />
      )}
    </>
  );
}

function useDone() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['livetv-options', session?.serverUrl] });
    navigate('/dashboard/livetv');
  };
}

/** "Enable for all tuner devices", or a checkbox per tuner. */
function TunerChoice(props: {
  tuners: TunerHost[];
  all: boolean;
  enabled: string[];
  onChange: (all: boolean, enabled: string[]) => void;
}) {
  const { all, enabled, onChange } = props;
  return (
    <>
      <CheckboxField label="Enable for all tuner devices" checked={all} onChange={(on) => onChange(on, enabled)} />
      {!all && (
        <fieldset className="form-fieldset">
          <legend>Tuners</legend>
          {props.tuners.map((t) => (
            <CheckboxField
              key={t.Id}
              label={`${t.FriendlyName || tunerTypeName(t.Type)} — ${displayUrl(t.Url)}`}
              checked={enabled.includes(t.Id!)}
              onChange={(on) => onChange(all, on ? [...enabled, t.Id!] : enabled.filter((v) => v !== t.Id))}
            />
          ))}
        </fieldset>
      )}
    </>
  );
}

function XmlTvForm(props: { api: Api; start: ListingsProvider; id: string | null; tuners: TunerHost[] }) {
  const s = props.start;
  const [f, setF] = useState({
    Path: s.Path ?? '',
    Movies: joinCategories(s.MovieCategories),
    MoviePrefix: s.MoviePrefix ?? '',
    Kids: joinCategories(s.KidsCategories),
    News: joinCategories(s.NewsCategories),
    Sports: joinCategories(s.SportsCategories),
    UserAgent: s.UserAgent ?? '',
    all: s.EnableAllTuners ?? true,
    enabled: s.EnabledTuners ?? [],
  });
  const done = useDone();
  const save = useMutation({
    mutationFn: () =>
      saveListingProvider(
        props.api,
        {
          ...s,
          ...(props.id ? { Id: props.id } : {}),
          Type: 'xmltv',
          Path: f.Path,
          MoviePrefix: f.MoviePrefix || null,
          UserAgent: f.UserAgent || null,
          MovieCategories: splitCategories(f.Movies),
          KidsCategories: splitCategories(f.Kids),
          NewsCategories: splitCategories(f.News),
          SportsCategories: splitCategories(f.Sports),
          EnableAllTuners: f.all,
          EnabledTuners: f.all ? [] : f.enabled,
        },
        { validateListings: true },
      ),
    onSuccess: done,
  });
  const set = (c: Partial<typeof f>) => {
    save.reset();
    setF((x) => ({ ...x, ...c }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form className="settings-form" data-testid="xmltv-form" onSubmit={submit}>
      <div className="form-section">
        <TextField
          label="File or URL"
          value={f.Path}
          required
          onChange={(v) => set({ Path: v })}
          help="A path to a XMLTV file. The server reads this file and periodically checks it for updates. You are responsible for creating and updating the file."
        />
        <TextField
          label="Movie categories"
          value={f.Movies}
          onChange={(v) => set({ Movies: v })}
          help="Programs with these categories will be displayed as movies. Separate multiple with '|'."
        />
        <TextField
          label="Movie prefix"
          value={f.MoviePrefix}
          onChange={(v) => set({ MoviePrefix: v })}
          help="If a prefix is applied to movie titles, enter it here so the server can handle it properly."
        />
        <TextField
          label="Children's categories"
          value={f.Kids}
          onChange={(v) => set({ Kids: v })}
          help="Programs with these categories will be displayed as programs for children. Separate multiple with '|'."
        />
        <TextField
          label="News categories"
          value={f.News}
          onChange={(v) => set({ News: v })}
          help="Programs with these categories will be displayed as news programs. Separate multiple with '|'."
        />
        <TextField
          label="Sports categories"
          value={f.Sports}
          onChange={(v) => set({ Sports: v })}
          help="Programs with these categories will be displayed as sports programs. Separate multiple with '|'."
        />
        <TextField
          label="User agent"
          value={f.UserAgent}
          onChange={(v) => set({ UserAgent: v })}
          help="Supply a custom 'User-Agent' HTTP header."
        />
        <TunerChoice tuners={props.tuners} all={f.all} enabled={f.enabled} onChange={(all, enabled) => set({ all, enabled })} />
      </div>
      <SubmitRow
        busy={save.isPending}
        error={save.isError ? 'There was an error accessing the XMLTV file. Please ensure the file exists and try again.' : null}
      />
    </form>
  );
}

function SubmitRow(props: { busy: boolean; error: string | null }) {
  return (
    <div className="save-bar">
      <button type="submit" className="button-primary" disabled={props.busy}>
        {props.busy ? 'Saving…' : 'Save'}
      </button>
      <Link to="/dashboard/livetv" className="dash-button">
        Cancel
      </Link>
      {props.error && (
        <span className="form-error" role="alert">
          {props.error}
        </span>
      )}
    </div>
  );
}

/** Schedules Direct in jellyfin-web's two steps: 1 Login, 2 Select Listings. */
function SchedulesDirectForm(props: { api: Api; start: ListingsProvider; id: string | null; tuners: TunerHost[] }) {
  const { api } = props;
  const [providerId, setProviderId] = useState(props.id);
  const [info, setInfo] = useState<ListingsProvider>(props.start);
  const [user, setUser] = useState(info.Username ?? '');
  const [pass, setPass] = useState('');
  const [country, setCountry] = useState(info.Country ?? '');
  const [zip, setZip] = useState(info.ZipCode ?? '');
  const [lineup, setLineup] = useState(info.ListingsId ?? '');
  const [all, setAll] = useState(info.EnableAllTuners ?? true);
  const [enabled, setEnabled] = useState<string[]>(info.EnabledTuners ?? []);
  const loggedIn = !!providerId && !!info.Username;
  const done = useDone();

  const login = useMutation({
    mutationFn: () =>
      saveListingProvider(
        api,
        { Type: 'SchedulesDirect', Username: user, Password: pass, EnableAllTuners: true, ...(providerId ? { Id: providerId } : {}) },
        { validateLogin: true },
      ),
    onSuccess: (r) => {
      setProviderId(r.Id ?? providerId);
      setInfo((i) => ({ ...i, ...r, Username: user }));
    },
  });
  const countries = useQuery({
    queryKey: ['sd-countries'],
    enabled: loggedIn,
    queryFn: () => fetchSchedulesDirectCountries(api),
    staleTime: 60 * 60_000,
  });
  const [location, setLocation] = useState(zip);
  useEffect(() => {
    const t = setTimeout(() => setLocation(zip.trim()), 500);
    return () => clearTimeout(t);
  }, [zip]);
  const lineups = useQuery({
    queryKey: ['sd-lineups', providerId, country, location],
    enabled: loggedIn && !!country && !!location,
    queryFn: () => fetchLineups(api, providerId!, country, location),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!lineup) throw new Error('Please select a lineup and try again. If no lineups are available, then please check that your username, password, and postal code is correct.');
      return saveListingProvider(
        api,
        { ...info, Id: providerId!, ZipCode: zip, Country: country, ListingsId: lineup, EnableAllTuners: all, EnabledTuners: all ? [] : enabled },
        { validateListings: true },
      );
    },
    onSuccess: done,
  });

  return (
    <>
      <p className="form-help">
        Create an account at{' '}
        <a href="https://www.schedulesdirect.org" target="_blank" rel="noreferrer">
          https://www.schedulesdirect.org
        </a>
      </p>
      <FormSection title="1. Login">
        <form
          className="settings-form"
          data-testid="sd-login-form"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <TextField label="Username" value={user} required onChange={setUser} />
          <TextField label="Password" type="password" value={pass} required onChange={setPass} />
          <div className="save-bar">
            <button type="submit" className="button-primary" disabled={login.isPending}>
              {login.isPending ? 'Saving…' : 'Save'}
            </button>
            {login.isError && (
              <span className="form-error" role="alert">
                There was an error saving the TV provider. Please ensure it is accessible and try again.
              </span>
            )}
          </div>
        </form>
      </FormSection>
      {loggedIn && (
        <FormSection title="2. Select Listings">
          <form
            className="settings-form"
            data-testid="sd-listings-form"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {countries.isError && (
              <p className="form-error" role="alert">
                {countries.error.message}
              </p>
            )}
            <SelectField
              label="Country/Region"
              value={country}
              onChange={setCountry}
              options={[['', ''], ...(countries.data ?? []).map((c) => [c.value, c.name] as const)]}
            />
            <TextField label="Zip Code" value={zip} required onChange={setZip} />
            <SelectField
              label="Lineup"
              value={lineup}
              onChange={setLineup}
              options={[['', ''], ...(lineups.data ?? []).map((l) => [l.Id, l.Name] as const)]}
            />
            {lineups.isError && (
              <p className="form-error" role="alert">
                {lineups.error.message}
              </p>
            )}
            <TunerChoice
              tuners={props.tuners}
              all={all}
              enabled={enabled}
              onChange={(a, e) => {
                setAll(a);
                setEnabled(e);
              }}
            />
            <SubmitRow
              busy={save.isPending}
              error={
                save.error?.message.startsWith('Please')
                  ? save.error.message
                  : save.isError
                    ? 'There was an error adding the lineup to your Schedules Direct account. Schedules Direct only allows a limited number of lineups per account. You may need to log into the Schedules Direct website and remove others listings from your account before proceeding.'
                    : null
              }
            />
          </form>
        </FormSection>
      )}
    </>
  );
}
