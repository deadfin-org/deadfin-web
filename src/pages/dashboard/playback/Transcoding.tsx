import type { components } from '../../../api/schema';
import { CheckboxField } from '../../../ui/Form';
import { NumberField, SelectField, SettingsForm, TextField, saveNamedConfiguration, useSettings } from '../settings';

type EncodingOptions = components['schemas']['EncodingOptions'];

/** Hardware decoders per codec, as jellyfin-web features/playback/constants/codecs.ts. */
export const CODECS: { name: string; codec: string; types: string[] }[] = [
  { name: 'H264', codec: 'h264', types: ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp', 'videotoolbox', 'v4l2m2m'] },
  { name: 'HEVC', codec: 'hevc', types: ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp', 'videotoolbox'] },
  { name: 'MPEG1', codec: 'mpeg1video', types: ['rkmpp'] },
  { name: 'MPEG2', codec: 'mpeg2video', types: ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp'] },
  { name: 'MPEG4', codec: 'mpeg4', types: ['nvenc', 'rkmpp'] },
  { name: 'VC1', codec: 'vc1', types: ['amf', 'nvenc', 'qsv', 'vaapi'] },
  { name: 'VP8', codec: 'vp8', types: ['nvenc', 'qsv', 'vaapi', 'rkmpp', 'videotoolbox'] },
  { name: 'VP9', codec: 'vp9', types: ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp', 'videotoolbox'] },
  { name: 'AV1', codec: 'av1', types: ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp', 'videotoolbox'] },
];
const HEVC_VP9_10BIT = ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp'];
const HEVC_REXT = ['nvenc', 'qsv', 'vaapi'];
const HWA_TONEMAP = ['amf', 'nvenc', 'qsv', 'vaapi', 'rkmpp', 'videotoolbox'];

const HWA_TYPES = [
  ['none', 'None'],
  ['amf', 'AMD AMF'],
  ['nvenc', 'Nvidia NVENC'],
  ['qsv', 'Intel Quicksync (QSV)'],
  ['vaapi', 'Video Acceleration API (VAAPI)'],
  ['rkmpp', 'Rockchip MPP (RKMPP)'],
  ['videotoolbox', 'Apple VideoToolBox'],
  ['v4l2m2m', 'Video4Linux2 (V4L2)'],
] as const;

const THREADS = [['-1', 'Auto'], ...Array.from({ length: 16 }, (_, i) => [String(i + 1), String(i + 1)] as const), ['0', 'Max']] as const;

/** Dashboard → Playback → Transcoding (`#/dashboard/playback/transcoding`). */
export function Transcoding() {
  const { draft: c, set, query, mutation } = useSettings<EncodingOptions>('encoding', (api, d) =>
    saveNamedConfiguration<EncodingOptions>(api, 'encoding', d),
  );
  const hwa = c?.HardwareAccelerationType || 'none';
  const isHwa = HWA_TONEMAP.includes(hwa);
  const codecs = CODECS.filter((x) => x.types.includes(hwa));
  const decoding = c?.HardwareDecodingCodecs ?? [];
  const check = (name: keyof EncodingOptions, label: string, help?: string) => (
    <CheckboxField label={label} help={help} checked={!!c?.[name]} onChange={(on) => set({ [name]: on })} />
  );

  return (
    <SettingsForm
      title="Transcoding"
      testId="transcoding-form"
      loadError="Failed to load transcoding settings"
      query={query}
      ready={!!c}
      mutation={mutation}
    >
      {c && (
        <>
          <div className="form-section">
            <SelectField
              label="Hardware acceleration"
              value={hwa}
              onChange={(v) => set({ HardwareAccelerationType: v as EncodingOptions['HardwareAccelerationType'] })}
              options={HWA_TYPES}
              help={
                hwa === 'none' ? (
                  'Hardware acceleration requires additional configuration.'
                ) : (
                  <>
                    Enabling hardware acceleration may cause instability in some environments. Ensure that your operating
                    system and video drivers are fully up to date. If you have difficulty playing video after enabling
                    this, change the setting back to None.
                  </>
                )
              }
            />
            {hwa === 'vaapi' && (
              <TextField
                label="VA-API Device"
                value={c.VaapiDevice}
                onChange={(v) => set({ VaapiDevice: v })}
                help="This is the render node that is used for hardware acceleration."
              />
            )}
            {hwa === 'qsv' && (
              <TextField
                label="QSV Device"
                value={c.QsvDevice}
                onChange={(v) => set({ QsvDevice: v })}
                help="Specify the device for Intel QSV on a multi-GPU system. On Linux, this is the render node, e.g., /dev/dri/renderD128. On Windows, this is the device index starting from 0. Leave blank unless you know what you are doing."
              />
            )}
            {hwa !== 'none' && (
              <fieldset className="form-fieldset" data-testid="hw-decoding">
                <legend>Enable hardware decoding for</legend>
                {codecs.map((x) => (
                  <CheckboxField
                    key={x.codec}
                    label={x.name}
                    checked={decoding.includes(x.codec)}
                    onChange={(on) =>
                      set({ HardwareDecodingCodecs: on ? [...decoding, x.codec] : decoding.filter((v) => v !== x.codec) })
                    }
                  />
                ))}
                {HEVC_VP9_10BIT.includes(hwa) && (
                  <>
                    {check('EnableDecodingColorDepth10Hevc', 'HEVC 10bit')}
                    {check('EnableDecodingColorDepth10Vp9', 'VP9 10bit')}
                  </>
                )}
                {HEVC_REXT.includes(hwa) && (
                  <>
                    {check('EnableDecodingColorDepth10HevcRext', 'HEVC RExt 8/10bit')}
                    {check('EnableDecodingColorDepth12HevcRext', 'HEVC RExt 12bit')}
                  </>
                )}
              </fieldset>
            )}
            {hwa === 'nvenc' &&
              check(
                'EnableEnhancedNvdecDecoder',
                'Enable enhanced NVDEC decoder',
                'Enhanced NVDEC implementation, disable this option to use CUVID if you encounter decoding errors.',
              )}
            {hwa === 'qsv' && check('PreferSystemNativeHwDecoder', 'Prefer OS native DXVA or VA-API hardware decoders')}
            {hwa !== 'none' && (
              <fieldset className="form-fieldset">
                <legend>Hardware encoding options</legend>
                {check('EnableHardwareEncoding', 'Enable hardware encoding')}
                {(hwa === 'qsv' || hwa === 'vaapi') && (
                  <>
                    {check('EnableIntelLowPowerH264HwEncoder', 'Enable Intel Low-Power H.264 hardware encoder')}
                    {check(
                      'EnableIntelLowPowerHevcHwEncoder',
                      'Enable Intel Low-Power HEVC hardware encoder',
                      'Low-Power Encoding can keep unnecessary CPU-GPU sync. On Linux they must be disabled if the i915 HuC firmware is not configured.',
                    )}
                  </>
                )}
              </fieldset>
            )}
            <fieldset className="form-fieldset">
              <legend>Encoding format options</legend>
              <p className="form-help">
                Select the video encoding that the server should transcode to. The server uses software encoding when
                hardware acceleration for the selected format is not available. H264 encoding is always enabled.
              </p>
              {check('AllowHevcEncoding', 'Allow encoding in HEVC format')}
              {check('AllowAv1Encoding', 'Allow encoding in AV1 format')}
            </fieldset>

            {(hwa === 'qsv' || hwa === 'vaapi') && (
              <>
                {check(
                  'EnableVppTonemapping',
                  'Enable VPP Tone mapping',
                  'Full Intel driver based tone-mapping. Currently works only on certain hardware with HDR10 videos. This has a higher priority compared to another OpenCL implementation.',
                )}
                <NumberField
                  label="VPP Tone mapping brightness gain"
                  value={c.VppTonemappingBrightness}
                  onChange={(v) => set({ VppTonemappingBrightness: v ?? 0 })}
                  min={0}
                  max={100}
                  step={0.00001}
                  help="Apply brightness gain in VPP tone mapping. The recommended value is 16."
                />
                <NumberField
                  label="VPP Tone mapping contrast gain"
                  value={c.VppTonemappingContrast}
                  onChange={(v) => set({ VppTonemappingContrast: v ?? 1 })}
                  min={1}
                  max={2}
                  step={0.00001}
                  help="Apply contrast gain in VPP tone mapping. The recommended value is 1."
                />
              </>
            )}
            {hwa === 'videotoolbox' &&
              check(
                'EnableVideoToolboxTonemapping',
                'Enable VideoToolbox Tone mapping',
                'Hardware-accelerated tone-mapping provided by VideoToolbox. It works with most HDR formats, including HDR10, HDR10+, and HLG, but does not work with Dolby Vision Profile 5. This has a higher priority compared to another Metal implementation.',
              )}
            {(hwa === 'none' || isHwa) && (
              <>
                {isHwa &&
                  check(
                    'EnableTonemapping',
                    'Enable Tone mapping',
                    'Tone-mapping can transform the dynamic range of a video from HDR to SDR while maintaining image details and colors. Currently works only with 10bit HDR10, HLG and DoVi videos. This requires the corresponding GPGPU runtime.',
                  )}
                <SelectField
                  label="Select the Tone mapping algorithm to use"
                  value={c.TonemappingAlgorithm}
                  onChange={(v) => set({ TonemappingAlgorithm: v as EncodingOptions['TonemappingAlgorithm'] })}
                  options={[
                    ['none', 'None'],
                    ['clip', 'Clip'],
                    ['linear', 'Linear'],
                    ['gamma', 'Gamma'],
                    ['reinhard', 'Reinhard'],
                    ['hable', 'Hable'],
                    ['mobius', 'Mobius'],
                    ['bt2390', 'BT.2390'],
                  ]}
                  help="Tone mapping can be fine-tuned. If you are not familiar with these options, just keep the default. The recommended value is 'BT.2390'."
                />
                {isHwa && (
                  <SelectField
                    label="Tone mapping mode"
                    value={c.TonemappingMode}
                    onChange={(v) => set({ TonemappingMode: v as EncodingOptions['TonemappingMode'] })}
                    options={[
                      ['auto', 'Auto'],
                      ['max', 'MAX'],
                      ['rgb', 'RGB'],
                      ['lum', 'LUM'],
                      ['itp', 'ITP'],
                    ]}
                    help="Select the tone mapping mode. If you experience blown out highlights try switching to the RGB mode."
                  />
                )}
                <SelectField
                  label="Tone mapping range"
                  value={c.TonemappingRange}
                  onChange={(v) => set({ TonemappingRange: v as EncodingOptions['TonemappingRange'] })}
                  options={[
                    ['auto', 'Auto'],
                    ['tv', 'TV'],
                    ['pc', 'PC'],
                  ]}
                  help="Select the output color range. Auto is the same as the input range."
                />
                <NumberField
                  label="Tone mapping desat"
                  value={c.TonemappingDesat}
                  onChange={(v) => set({ TonemappingDesat: v ?? 0 })}
                  min={0}
                  step={0.00001}
                  help="Apply desaturation for highlights that exceed this level of brightness. The recommended value is 0 (disable)."
                />
                <NumberField
                  label="Tone mapping peak"
                  value={c.TonemappingPeak}
                  onChange={(v) => set({ TonemappingPeak: v ?? 0 })}
                  min={0}
                  step={0.00001}
                  help="Override the embedded metadata value for the input signal with this peak value instead. The default value is 100 (1000nit)."
                />
                <NumberField
                  label="Tone mapping param"
                  value={c.TonemappingParam || null}
                  onChange={(v) => set({ TonemappingParam: v ?? 0 })}
                  min={0}
                  step={0.00001}
                  help="Tune the tone mapping algorithm. Generally leave it blank."
                />
              </>
            )}

            <SelectField
              label="Transcoding thread count"
              value={String(c.EncodingThreadCount ?? -1)}
              onChange={(v) => set({ EncodingThreadCount: Number(v) })}
              options={THREADS}
              help="Select the maximum number of threads to use when transcoding. Reducing the thread count will lower CPU usage but may not convert fast enough for a smooth playback experience."
            />
            <TextField
              label="FFmpeg path"
              value={c.EncoderAppPathDisplay}
              onChange={() => {}}
              disabled
              help="The path to the FFmpeg application file or folder containing FFmpeg."
            />
            <TextField
              label="Transcode path"
              value={c.TranscodingTempPath}
              onChange={(v) => set({ TranscodingTempPath: v })}
              help="Specify a custom path for the transcode files served to clients. Leave blank to use the server default."
            />
            <TextField
              label="Fallback font folder path"
              value={c.FallbackFontPath}
              onChange={(v) => set({ FallbackFontPath: v })}
              help="These fonts are used by some clients to render subtitles."
            />
            {check(
              'EnableFallbackFont',
              'Enable fallback fonts',
              'Enable custom alternate fonts. This can avoid the problem of incorrect subtitle rendering.',
            )}
            {check(
              'EnableAudioVbr',
              'Enable VBR audio encoding',
              'Variable bitrate offers better quality to average bitrate ratio, but in some rare cases may cause buffering and compatibility issues.',
            )}
            <NumberField
              label="Audio boost when downmixing"
              value={c.DownMixAudioBoost}
              onChange={(v) => set({ DownMixAudioBoost: v ?? 1 })}
              min={0.5}
              max={3}
              step={0.1}
              required
              help="Boost audio when downmixing. A value of one will preserve the original volume."
            />
            <SelectField
              label="Stereo Downmix Algorithm"
              value={c.DownMixStereoAlgorithm}
              onChange={(v) => set({ DownMixStereoAlgorithm: v as EncodingOptions['DownMixStereoAlgorithm'] })}
              options={[
                ['None', 'None'],
                ['Dave750', 'Dave750'],
                ['NightmodeDialogue', 'NightmodeDialogue'],
                ['Rfc7845', 'RFC7845'],
                ['Ac4', 'AC-4'],
              ]}
              help="Algorithm used to downmix multi-channel audio to stereo."
            />
            <SelectField
              label="Audio seek strategy"
              value={c.HlsAudioSeekStrategy}
              onChange={(v) => set({ HlsAudioSeekStrategy: v as EncodingOptions['HlsAudioSeekStrategy'] })}
              options={[
                ['TrimCopiedAudio', 'TrimCopiedAudio'],
                ['TranscodeAudio', 'TranscodeAudio'],
              ]}
              help="The strategy to use when seeking in HLS streams."
            />
            <NumberField
              label="Max muxing queue size"
              value={c.MaxMuxingQueueSize}
              onChange={(v) => set({ MaxMuxingQueueSize: v ?? 0 })}
              min={0}
              help='Maximum number of packets that can be buffered while waiting for all streams to initialize. Try to increase it if you still meet "Too many packets buffered for output stream" error in FFmpeg logs. The recommended value is 2048.'
            />
            <SelectField
              label="Encoding preset"
              value={c.EncoderPreset}
              onChange={(v) => set({ EncoderPreset: v as EncodingOptions['EncoderPreset'] })}
              options={[
                ['auto', 'Auto'],
                ...['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast', 'superfast', 'ultrafast'].map(
                  (p) => [p, p] as const,
                ),
              ]}
              help="Pick a faster value to improve performance, or a slower value to improve quality."
            />
            <NumberField
              label="H.265 encoding CRF"
              value={c.H265Crf}
              onChange={(v) => set({ H265Crf: v ?? 28 })}
              min={0}
              max={51}
            />
            <NumberField
              label="H.264 encoding CRF"
              value={c.H264Crf}
              onChange={(v) => set({ H264Crf: v ?? 23 })}
              min={0}
              max={51}
              help="The 'Constant Rate Factor' (CRF) is the default quality setting for the x264 and x265 software encoders. Values are between 0 and 51; lower values give better quality and larger files. Sane values are between 18 and 28. The default for x264 is 23, and for x265 is 28. Hardware encoders do not use these settings."
            />
            <SelectField
              label="Deinterlacing method"
              value={c.DeinterlaceMethod}
              onChange={(v) => set({ DeinterlaceMethod: v as EncodingOptions['DeinterlaceMethod'] })}
              options={[
                ['yadif', 'Yet Another DeInterlacing Filter (YADIF)'],
                ['bwdif', 'Bob Weaver DeInterlacing Filter (BWDIF)'],
              ]}
              help="Select the deinterlacing method to use when software transcoding interlaced content. When hardware acceleration supporting hardware deinterlacing is enabled the hardware deinterlacer will be used instead of this setting."
            />
            {check(
              'DeinterlaceDoubleRate',
              'Double the frame rate when deinterlacing',
              'This setting uses the field rate when deinterlacing, often referred to as bob deinterlacing, which doubles the frame rate of the video to provide full motion like what you would see when viewing interlaced video on a TV.',
            )}
            {check(
              'EnableSubtitleExtraction',
              'Allow subtitle extraction on the fly',
              'Embedded subtitles can be extracted from videos and delivered to clients in plain text, in order to help prevent video transcoding. On some systems this can take a long time and cause video playback to stall during the extraction process. Disable this to have embedded subtitles burned in with video transcoding when they are not natively supported by the client device.',
            )}
            {check(
              'EnableThrottling',
              'Throttle Transcodes',
              'When a transcode or remux gets far enough ahead from the current playback position, pause the process so it will consume fewer resources. This is most useful when watching without seeking often. Turn this off if you experience playback issues.',
            )}
            {check(
              'EnableSegmentDeletion',
              'Delete segments',
              'Delete old segments after they have been downloaded by the client. This prevents having to store the entire transcoded file on disk. Turn this off if you experience playback issues.',
            )}
            <NumberField
              label="Throttle after"
              value={c.ThrottleDelaySeconds}
              onChange={(v) => set({ ThrottleDelaySeconds: v ?? 180 })}
              min={10}
              max={3600}
              help="Time in seconds after which the transcoder will be throttled. Must be large enough for the client to maintain a healthy buffer. Only works if throttling is enabled."
            />
            <NumberField
              label="Time to keep segments"
              value={c.SegmentKeepSeconds}
              onChange={(v) => set({ SegmentKeepSeconds: v ?? 720 })}
              min={10}
              max={3600}
              help="Time in seconds for which segments should be kept after they are downloaded by the client. Only works if segment deletion is enabled."
            />
          </div>
        </>
      )}
    </SettingsForm>
  );
}
