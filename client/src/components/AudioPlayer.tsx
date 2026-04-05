import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Music } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  name?: string;
}

function formatTime(s: number) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ src, name }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => { setDuration(audio.duration); setLoading(false); };
    const onEnded = () => setPlaying(false);
    const onCanPlay = () => setLoading(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      // Pause all other audio elements on page
      document.querySelectorAll('audio').forEach(a => {
        if (a !== audio) a.pause();
      });
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const val = Number(e.target.value);
    audio.currentTime = val;
    setCurrentTime(val);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const trackName = name || src.split('/').pop() || 'Аудио';

  return (
    <div className="flex items-center gap-3 bg-slate-800/70 border border-slate-700 rounded-xl px-4 py-3 mt-2">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 transition-colors flex-shrink-0"
      >
        {playing
          ? <Pause size={16} className="text-white" />
          : <Play size={16} className="text-white ml-0.5" />
        }
      </button>

      {/* Track info + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Music size={12} className="text-primary-400 flex-shrink-0" />
          <p className="text-xs text-slate-300 truncate">{trackName}</p>
        </div>

        {/* Progress bar */}
        <div className="relative group/bar">
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            style={{ touchAction: 'none' }}
          />
        </div>
      </div>

      {/* Time */}
      <div className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
        {formatTime(currentTime)}<span className="text-slate-700 mx-0.5">/</span>{formatTime(duration)}
      </div>
    </div>
  );
}
