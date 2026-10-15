import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import {
  directStreamUrl,
  getPlaybackInfo,
  pickDirectPlaySource,
  reportProgress,
  reportStart,
  reportStopped,
  type MediaSource,
} from '../api/playback';
import { formatTimecode, secondsToTicks, ticksToSeconds } from '../lib/format';
import './player.css';

const PROGRESS_INTERVAL_MS = 5_000;
const CONTROLS_HIDE_MS = 2_800;

export function Player() {
  const { itemId } = useParams<{ itemId: string }>();
  const { session, api } = useAuth();
  if (!session || !api || !itemId) return null;
  return <PlayerInner key={itemId} itemId={itemId} />;
}

function PlayerInner({ itemId }: { itemId: string }) {
  const { session, api } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const startTicks = Number(search.get('t') ?? 0) || 0;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<{ url: string; media: MediaSource; playSessionId?: string | null } | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Negotiate once per item: PlaybackInfo → direct-play source → static URL.
  useEffect(() => {
    if (!session || !api) return;
    let cancelled = false;
    getPlaybackInfo(api, itemId, session.userId, startTicks)
      .then((info) => {
        if (cancelled) return;
        const media = pickDirectPlaySource(info);
        if (!media) {
          setFault("this file can't play in this browser yet");
          return;
        }
        setSource({
          url: directStreamUrl(session.serverUrl, itemId, media, session.accessToken),
          media,
          playSessionId: info.PlaySessionId,
        });
      })
      .catch(() => !cancelled && setFault('playback negotiation failed'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Session reporting: start on first play, progress on a beat, stopped on exit.
  useEffect(() => {
    if (!source || !api) return;
    const video = videoRef.current;
    if (!video) return;
    const ctx = {
      api,
      itemId,
      mediaSourceId: source.media.Id,
      playSessionId: source.playSessionId,
    };
    const pos = () => secondsToTicks(video.currentTime);
    let started = false;
    // One stop per start: ended, pagehide and unmount can all fire. After a
    // stop, playing again (a bfcache restore) reports a fresh start.
    const stop = () => {
      if (!started) return;
      started = false;
      reportStopped(ctx, pos());
    };

    const onPlaying = () => {
      setPaused(false);
      if (!started) {
        started = true;
        reportStart(ctx, pos());
      } else {
        reportProgress(ctx, pos(), false);
      }
    };
    const onPause = () => {
      setPaused(true);
      reportProgress(ctx, pos(), true);
    };
    const onSeeked = () => reportProgress(ctx, pos(), video.paused);
    const onEnded = stop;
    const onTime = () => setTime(video.currentTime);
    const onMeta = () => {
      setDuration(video.duration);
      if (startTicks > 0) video.currentTime = ticksToSeconds(startTicks);
    };
    const onError = () => setFault('the stream faulted');

    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onError);
    const beat = setInterval(() => {
      if (!video.paused && !video.ended) reportProgress(ctx, pos(), false);
    }, PROGRESS_INTERVAL_MS);
    // pagehide, not beforeunload: it fires on tab close, navigation away and
    // bfcache entry, including on iOS Safari.
    window.addEventListener('pagehide', stop);

    return () => {
      clearInterval(beat);
      window.removeEventListener('pagehide', stop);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onError);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const poke = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poke]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setFault('playback was blocked'));
    else v.pause();
  };

  const seekTo = (fraction: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, fraction * v.duration));
  };

  if (fault)
    return (
      <main className="player player-faulted">
        <p className="home-status readout" role="alert">
          ▲ {fault} — <Link to={`/item/${itemId}`}>back to the manifest</Link>
        </p>
      </main>
    );

  const progress = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <main
      className={controlsVisible ? 'player' : 'player controls-hidden'}
      onMouseMove={poke}
      onClick={poke}
      data-testid="player"
    >
      {source && (
        <video
          ref={videoRef}
          className="player-video"
          src={source.url}
          autoPlay
          playsInline
          data-testid="player-video"
        />
      )}

      <div className="player-shade" aria-hidden="true" />

      <div className="player-controls" data-testid="player-controls">
        <button
          className="player-back readout"
          data-testid="player-back"
          onClick={() => navigate(`/item/${itemId}`)}
        >
          ← surface
        </button>

        <div className="player-bottom">
          <button
            className="player-toggle"
            data-testid="player-toggle"
            aria-label={paused ? 'play' : 'pause'}
            onClick={togglePlay}
          >
            {paused ? '▶' : '❚❚'}
          </button>

          <div
            className="player-track"
            data-testid="player-track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
          >
            <div className="player-track-fill" style={{ width: `${progress}%` }} />
          </div>

          <span className="player-timecode readout" data-testid="player-timecode">
            {formatTimecode(time)} / {formatTimecode(duration)}
          </span>

          <button
            className="player-fullscreen readout"
            aria-label="fullscreen"
            onClick={() => {
              const el = document.querySelector('.player');
              if (document.fullscreenElement) void document.exitFullscreen();
              else if (el) void el.requestFullscreen().catch(() => undefined);
            }}
          >
            ⛶
          </button>
        </div>
      </div>
    </main>
  );
}
