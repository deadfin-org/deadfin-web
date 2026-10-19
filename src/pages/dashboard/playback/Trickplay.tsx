import { useState } from 'react';
import type { components } from '../../../api/schema';
import { CheckboxField } from '../../../ui/Form';
import {
  NumberField,
  SelectField,
  SettingsForm,
  TextField,
  joinList,
  saveServerConfiguration,
  splitList,
  useSettings,
  type ServerConfiguration,
} from '../settings';

type TrickplayOptions = components['schemas']['TrickplayOptions'];

/** Widths from the comma-separated text; items that are not positive whole numbers drop out. */
export function parseWidths(text: string): number[] {
  return splitList(text)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Dashboard → Playback → Trickplay (`#/dashboard/playback/trickplay`). */
export function Trickplay() {
  const [widths, setWidths] = useState<string | null>(null);
  const { draft: c, set, query, mutation } = useSettings<ServerConfiguration>(null, (api, d) =>
    saveServerConfiguration(api, (stored) => ({
      ...stored,
      TrickplayOptions: {
        ...stored.TrickplayOptions,
        ...d.TrickplayOptions,
        ...(widths !== null ? { WidthResolutions: parseWidths(widths) } : {}),
      },
    })),
  );
  const t: TrickplayOptions = c?.TrickplayOptions ?? {};
  const setT = (changes: Partial<TrickplayOptions>) => set({ TrickplayOptions: { ...t, ...changes } });
  const check = (name: keyof TrickplayOptions, label: string, help?: string) => (
    <CheckboxField label={label} help={help} checked={!!t[name]} onChange={(on) => setT({ [name]: on })} />
  );
  return (
    <SettingsForm
      title="Trickplay"
      testId="trickplay-form"
      loadError="Failed to load trickplay settings"
      query={query}
      ready={!!c}
      mutation={mutation}
    >
      {c && (
        <div className="form-section">
          {check('EnableHwAcceleration', 'Enable hardware decoding')}
          {check(
            'EnableHwEncoding',
            'Enable hardware accelerated MJPEG encoding',
            'Currently only available on QSV, VA-API, VideoToolbox and RKMPP, this option has no effect on other hardware acceleration methods.',
          )}
          {check(
            'EnableKeyFrameOnlyExtraction',
            'Only generate images from key frames',
            'Extract key frames only for significantly faster processing with less accurate timing. If the configured hardware decoder does not support this mode, will use the software decoder instead.',
          )}
          <SelectField
            label="Scan Behavior"
            value={t.ScanBehavior}
            onChange={(v) => setT({ ScanBehavior: v as TrickplayOptions['ScanBehavior'] })}
            options={[
              ['NonBlocking', 'Non Blocking - queues generation, then returns'],
              ['Blocking', 'Blocking - queues generation, blocks scan until complete'],
            ]}
            help="The default behavior is non blocking, which will add media to the library before trickplay generation is done. Blocking will ensure trickplay files are generated before media is added to the library, but will make scans significantly longer."
          />
          <SelectField
            label="Process Priority"
            value={t.ProcessPriority}
            onChange={(v) => setT({ ProcessPriority: v as TrickplayOptions['ProcessPriority'] })}
            options={[
              ['High', 'High'],
              ['AboveNormal', 'Above Normal'],
              ['Normal', 'Normal'],
              ['BelowNormal', 'Below Normal'],
              ['Idle', 'Idle'],
            ]}
            help="Setting this lower or higher will determine how the CPU prioritizes the ffmpeg trickplay generation process in relation to other processes. If you notice slowdown while generating trickplay images but don't want to fully stop their generation, try lowering this as well as the thread count."
          />
          <NumberField
            label="Image Interval"
            value={t.Interval}
            onChange={(v) => setT({ Interval: v ?? 10000 })}
            min={1}
            required
            help="Interval of time (ms) between each new trickplay image."
          />
          <TextField
            label="Width Resolutions"
            value={widths ?? joinList(t.WidthResolutions?.map(String), ',')}
            onChange={(v) => {
              mutation.reset();
              setWidths(v);
            }}
            help="Comma separated list of the widths (px) that trickplay images will be generated at. All images should generate proportionally to the source, so a width of 320 on a 16:9 video ends up around 320x180."
          />
          <NumberField
            label="Tile Width"
            value={t.TileWidth}
            onChange={(v) => setT({ TileWidth: v ?? 10 })}
            min={1}
            required
            help="Maximum number of images per tile in the X direction."
          />
          <NumberField
            label="Tile Height"
            value={t.TileHeight}
            onChange={(v) => setT({ TileHeight: v ?? 10 })}
            min={1}
            required
            help="Maximum number of images per tile in the Y direction."
          />
          <NumberField
            label="JPEG Quality"
            value={t.JpegQuality}
            onChange={(v) => setT({ JpegQuality: v ?? 90 })}
            min={1}
            max={100}
            required
            help="The JPEG compression quality for trickplay images."
          />
          <NumberField
            label="Qscale"
            value={t.Qscale}
            onChange={(v) => setT({ Qscale: v ?? 4 })}
            min={2}
            max={31}
            required
            help="The quality scale of images output by ffmpeg, with 2 being the highest quality and 31 being the lowest."
          />
          <NumberField
            label="FFmpeg Threads"
            value={t.ProcessThreads}
            onChange={(v) => setT({ ProcessThreads: v ?? 1 })}
            min={0}
            required
            help="The number of threads to pass to the '-threads' argument of ffmpeg."
          />
        </div>
      )}
    </SettingsForm>
  );
}
