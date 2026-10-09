// Запись голоса в браузере (MediaRecorder): общий выбор формата для голосовых
// чата (ChatPage) и голосового ввода «Ищу музыканта» (FindMusicianPage).
import { useCallback, useEffect, useRef, useState } from 'react';

// AAC/MP4 воспроизводится везде, включая старые iOS (webm там не играет), и это
// единственное, что пишет iOS Safari; webm/opus — запасной вариант, если браузер
// не пишет mp4.
export const VOICE_MIME_CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

export function pickVoiceMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return VOICE_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

/** Можно ли записывать голос: есть MediaRecorder и getUserMedia (только в защищённом контексте — https/localhost). */
export function isVoiceRecordingSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.isSecureContext === false) return false;
  return typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** Расширение файла для типа записи («audio/mp4» → «m4a»). */
export function voiceFileExt(type: string): string {
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

export type VoiceRecorderStatus = 'idle' | 'starting' | 'recording';
export type VoiceRecorderError = 'denied' | 'no-device' | 'failed';

export interface VoiceRecording {
  blob: Blob;
  /** Тип без параметров: «audio/mp4», «audio/webm». */
  mimeType: string;
  durationMs: number;
}

interface Options {
  maxSeconds: number;
  onRecorded: (rec: VoiceRecording) => void;
  onError: (kind: VoiceRecorderError) => void;
}

type AudioContextCtor = typeof AudioContext;

function errorKind(e: unknown): VoiceRecorderError {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no-device';
  return 'failed';
}

/**
 * Запись с микрофона: start() — строго из обработчика тапа (iOS не даёт
 * микрофон/AudioContext без жеста), автостоп через maxSeconds, stop()/cancel().
 * analyserRef — уровень громкости для волны (AnalyserNode; читается без
 * перерисовки React). Микрофон освобождается после записи, при отмене и при
 * уходе со страницы (размонтирование, pagehide).
 */
export function useVoiceRecorder({ maxSeconds, onRecorded, onError }: Options) {
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const statusRef = useRef<VoiceRecorderStatus>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  // Номер попытки: ответ getUserMedia от отменённой попытки не должен включить запись.
  const sessionRef = useRef(0);
  const startedAtRef = useRef(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const callbacks = useRef({ onRecorded, onError });
  callbacks.current = { onRecorded, onError };

  const setStatusBoth = (s: VoiceRecorderStatus) => {
    statusRef.current = s;
    if (aliveRef.current) setStatus(s);
  };

  /** Освободить микрофон и аудио-граф. */
  const release = useCallback(() => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); return; } catch { /* упал stop — освобождаем вручную */ }
    }
    release();
    setStatusBoth('idle');
    if (aliveRef.current) setStartedAt(null);
  }, [release]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    sessionRef.current++;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (statusRef.current !== 'idle') return;
    setStatusBoth('starting');
    cancelledRef.current = false;
    const session = ++sessionRef.current;

    // AudioContext — синхронно в обработчике тапа: на iOS созданный после
    // await контекст остаётся «suspended», и волна не двигается.
    let ctx: AudioContext | null = null;
    try {
      const Ctor: AudioContextCtor | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      ctx = Ctor ? new Ctor() : null;
    } catch { ctx = null; }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      ctx?.close().catch(() => {});
      if (session !== sessionRef.current) return;
      setStatusBoth('idle');
      if (aliveRef.current) callbacks.current.onError(errorKind(e));
      return;
    }
    // Ушли со страницы или отменили, пока браузер спрашивал разрешение.
    if (!aliveRef.current || session !== sessionRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      if (session === sessionRef.current) setStatusBoth('idle');
      return;
    }
    streamRef.current = stream;
    audioCtxRef.current = ctx;

    const mime = pickVoiceMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      release();
      setStatusBoth('idle');
      callbacks.current.onError(errorKind(e));
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0].trim();
      const chunks = chunksRef.current;
      chunksRef.current = [];
      release();
      setStatusBoth('idle');
      if (aliveRef.current) setStartedAt(null);
      if (cancelledRef.current || !aliveRef.current) return;
      callbacks.current.onRecorded({ blob: new Blob(chunks, { type }), mimeType: type, durationMs });
    };

    if (ctx) {
      try {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(stream).connect(analyser);
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        analyserRef.current = analyser;
      } catch { analyserRef.current = null; /* без волны — запись работает */ }
    }

    recorderRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      release();
      setStatusBoth('idle');
      callbacks.current.onError(errorKind(e));
      return;
    }
    const now = Date.now();
    startedAtRef.current = now;
    setStartedAt(now);
    setStatusBoth('recording');
    autoStopRef.current = setTimeout(() => stop(), maxSeconds * 1000);
  }, [maxSeconds, release, stop]);

  // Уход со страницы: запись отменяется, микрофон освобождается.
  useEffect(() => {
    aliveRef.current = true;
    const onPageHide = () => {
      if (statusRef.current === 'idle') return;
      cancelledRef.current = true;
      sessionRef.current++;
      if (statusRef.current === 'starting') setStatusBoth('idle');
      try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop(); } catch { /* ниже release */ }
      release();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      aliveRef.current = false;
      onPageHide();
      release();
    };
  }, [release]);

  return { status, startedAt, analyserRef, start, stop, cancel };
}
