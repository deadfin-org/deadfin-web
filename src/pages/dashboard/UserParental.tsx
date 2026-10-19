import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../api/AuthContext';
import {
  fetchParentalRatings,
  groupRatings,
  hourLabel,
  ratingIndex,
  SCHEDULE_DAYS,
  UNRATED_ITEMS,
  updatePolicy,
  type AccessSchedule,
  type DynamicDayOfWeek,
  type UnratedItem,
  type UserDto,
} from '../../api/admin/users';
import { Dialog } from '../../ui/Modal';
import { CheckboxField, Field, FormSection, SaveBar } from '../../ui/Form';

/** Parental Control tab: maximum rating, unrated items, tags, access schedules. */
export function UserParentalTab({ user }: { user: UserDto }) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const p = user.Policy!;
  const ratingsQ = useQuery({ queryKey: ['admin', 'parental-ratings'], queryFn: () => fetchParentalRatings(api!), staleTime: Infinity });
  const ratings = useMemo(() => groupRatings(ratingsQ.data ?? []), [ratingsQ.data]);
  const [rating, setRating] = useState<number | null>(null);
  const shownRating = rating ?? (ratingsQ.data ? ratingIndex(ratings, p) : -1);
  const [blocked, setBlocked] = useState<UnratedItem[]>(p.BlockUnratedItems ?? []);
  const [allowedTags, setAllowedTags] = useState<string[]>(p.AllowedTags ?? []);
  const [blockedTags, setBlockedTags] = useState<string[]>(p.BlockedTags ?? []);
  const [schedules, setSchedules] = useState<AccessSchedule[]>(p.AccessSchedules ?? []);
  const [addingSchedule, setAddingSchedule] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const r = shownRating >= 0 ? ratings[shownRating] : undefined;
      return updatePolicy(api!, user.Id!, {
        ...p,
        MaxParentalRating: r?.RatingScore?.score ?? null,
        MaxParentalSubRating: r?.RatingScore?.subScore ?? null,
        BlockUnratedItems: blocked,
        AllowedTags: allowedTags,
        BlockedTags: blockedTags,
        AccessSchedules: schedules,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.Id] }),
  });
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    save.reset();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="dash-form" data-testid="user-parental-form">
      <Field label="Maximum allowed parental rating" help="Content with a higher rating will be hidden from this user.">
        {(id) => (
          <select id={id} value={shownRating} onChange={(e) => touch(setRating)(Number(e.target.value))}>
            <option value={-1}></option>
            {ratings.map((r, i) => (
              <option key={`${r.Name}-${i}`} value={i}>
                {r.Name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <FormSection title="Block items with no or unrecognized rating information">
        {UNRATED_ITEMS.map((u) => (
          <CheckboxField
            key={u.value}
            label={u.label}
            checked={blocked.includes(u.value)}
            onChange={(on) => touch(setBlocked)(on ? [...blocked, u.value] : blocked.filter((b) => b !== u.value))}
          />
        ))}
      </FormSection>
      <TagList
        title="Allow items with tags"
        help="Only show media with at least one of the specified tags."
        tags={allowedTags}
        onChange={touch(setAllowedTags)}
      />
      <TagList
        title="Block items with tags"
        help="Hide media with at least one of the specified tags."
        tags={blockedTags}
        onChange={touch(setBlockedTags)}
      />
      {!p.IsAdministrator && (
        <FormSection title="Access Schedule">
          <p className="form-help">Create an access schedule to limit access to certain hours.</p>
          <ul className="tag-list" data-testid="access-schedules">
            {schedules.map((s, i) => (
              <li key={i}>
                <span>
                  {SCHEDULE_DAYS.find((d) => d.value === s.DayOfWeek)?.label ?? s.DayOfWeek}: {hourLabel(s.StartHour ?? 0)} – {hourLabel(s.EndHour ?? 24)}
                </span>
                <button
                  type="button"
                  className="button-plain"
                  aria-label="Remove schedule"
                  onClick={() => touch(setSchedules)(schedules.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="button-plain" onClick={() => setAddingSchedule(true)}>
            + Add
          </button>
        </FormSection>
      )}
      <SaveBar busy={save.isPending} error={save.isError ? save.error.message : null} saved={save.isSuccess} />
      {addingSchedule && (
        <ScheduleDialog
          userId={user.Id!}
          onCancel={() => setAddingSchedule(false)}
          onAdd={(s) => {
            touch(setSchedules)([...schedules, s]);
            setAddingSchedule(false);
          }}
        />
      )}
    </form>
  );
}

function TagList(props: { title: string; help: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !props.tags.includes(t)) props.onChange([...props.tags, t]);
    setText('');
  };
  return (
    <FormSection title={props.title}>
      <ul className="tag-list">
        {props.tags.map((t) => (
          <li key={t}>
            <span>{t}</span>
            <button type="button" className="button-plain" aria-label={`Remove ${t}`} onClick={() => props.onChange(props.tags.filter((x) => x !== t))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="path-field">
        <input
          aria-label={`${props.title}: tag`}
          placeholder="Tag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="button-plain" onClick={add} disabled={!text.trim()}>
          + Add
        </button>
      </div>
      <p className="form-help">{props.help}</p>
    </FormSection>
  );
}

const HOURS = Array.from({ length: 48 }, (_, i) => i / 2);

function ScheduleDialog(props: { userId: string; onAdd: (s: AccessSchedule) => void; onCancel: () => void }) {
  const [day, setDay] = useState<DynamicDayOfWeek>('Sunday');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (start >= end) {
      setError('End time must be greater than the start time.');
      return;
    }
    props.onAdd({ Id: 0, UserId: props.userId, DayOfWeek: day, StartHour: start, EndHour: end });
  };
  return (
    <Dialog title="Access Schedule" onClose={props.onCancel}>
      <form onSubmit={submit}>
        <Field label="Day of week">
          {(id) => (
            <select id={id} value={day} onChange={(e) => setDay(e.target.value as DynamicDayOfWeek)}>
              {SCHEDULE_DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Start time">
          {(id) => (
            <select id={id} value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="End time">
          {(id) => (
            <select id={id} value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {[...HOURS.slice(1), 24].map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button-plain" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary">
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}
