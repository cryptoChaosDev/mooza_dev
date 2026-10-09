// QR-код визитки артиста: генерируется на клиенте (пакет qrcode, грузится
// лениво при открытии), PNG с подписью — для афиш, мерча, сцены.
// Модалка: портал + блокировка скролла (iOS) + safe-area; на телефоне — нижний
// лист, на десктопе — по центру.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Copy, Loader2, QrCode } from 'lucide-react';
import { useScrollLock } from '../../lib/scrollLock';
import { copyText } from '../../lib/artistUtils';
import { toast } from '../../stores/toastStore';
import { getApiError } from '../../lib/apiError';

const QR_SIZE = 1024;
const CAPTION_H = 190;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Строка, ужатая по ширине (с многоточием).
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

async function renderQrPng(url: string, title: string): Promise<{ dataUrl: string; blob: Blob | null }> {
  const mod: any = await import('qrcode');
  const QR = mod.default ?? mod;
  const qr = document.createElement('canvas');
  await QR.toCanvas(qr, url, {
    width: QR_SIZE,
    margin: 3,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  const out = document.createElement('canvas');
  out.width = QR_SIZE;
  out.height = QR_SIZE + CAPTION_H;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qr, 0, 0, QR_SIZE, QR_SIZE);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(fitText(ctx, title, QR_SIZE - 120), QR_SIZE / 2, QR_SIZE + 40);
  ctx.fillStyle = '#475569';
  ctx.font = `500 38px ${FONT}`;
  ctx.fillText(fitText(ctx, url.replace(/^https?:\/\//, ''), QR_SIZE - 120), QR_SIZE / 2, QR_SIZE + 110);

  const dataUrl = out.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => {
    try { out.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); }
  });
  return { dataUrl, blob };
}

export default function ArtistQrModal({
  url,
  title,
  fileName,
  onClose,
}: {
  url: string;
  title: string;
  fileName: string;
  onClose: () => void;
}) {
  useScrollLock(true);
  const [png, setPng] = useState<{ dataUrl: string; blob: Blob | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setPng(null);
    setFailed(false);
    renderQrPng(url, title)
      .then((r) => { if (alive) setPng(r); })
      .catch((e) => {
        if (!alive) return;
        setFailed(true);
        toast.error(getApiError(e, 'Не удалось создать QR-код'));
      });
    return () => { alive = false; };
  }, [url, title]);

  // onClose со страницы — новая функция на каждый рендер; держим в ref, чтобы
  // фокус не прыгал на «Закрыть» при каждом обновлении данных страницы.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const download = () => {
    if (!png) return;
    try {
      const href = png.blob ? URL.createObjectURL(png.blob) : png.dataUrl;
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (png.blob) setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (e) {
      toast.error(getApiError(e, 'Не удалось скачать PNG — нажмите и удерживайте картинку, чтобы сохранить'));
    }
  };

  const copy = async () => {
    if (await copyText(url)) toast.success('Ссылка скопирована');
    else toast.error('Не удалось скопировать — выделите ссылку вручную');
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="artist-qr-title"
        className="fixed z-[61] inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[400px] bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 flex-shrink-0 sm:hidden" />
        <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <QrCode size={18} className="text-primary-400 flex-shrink-0" />
            <h2 id="artist-qr-title" className="text-base font-bold text-white truncate">QR-код визитки</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-10 h-10 -mr-2 flex items-center justify-center hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="px-5 pb-1 overflow-y-auto min-h-0">
          <div className="mx-auto w-full max-w-[280px] aspect-[1024/1214] rounded-2xl bg-white overflow-hidden flex items-center justify-center">
            {png ? (
              // <img>, а не canvas: долгое нажатие на iOS/Android сохраняет картинку
              // (во встроенных браузерах Instagram/Telegram «скачать» может не работать).
              <img src={png.dataUrl} alt={`QR-код страницы ${title}`} className="w-full h-full object-contain" />
            ) : failed ? (
              <p className="text-sm text-slate-500 px-4 text-center">QR-код не создан</p>
            ) : (
              <Loader2 size={28} className="animate-spin text-slate-400" />
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400 text-center leading-relaxed">
            Распечатайте на афише, мерче или покажите со сцены — по коду откроется ваша страница на Moooza.
            Если файл не скачался, нажмите и удерживайте картинку.
          </p>
          <p className="mt-1 text-xs text-slate-500 text-center break-all">{url.replace(/^https?:\/\//, '')}</p>
        </div>

        <div className="px-5 pt-4 grid grid-cols-2 gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={copy}
            className="min-h-[48px] rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-100 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Copy size={16} /> Ссылка
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!png}
            className="min-h-[48px] rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download size={16} /> Скачать PNG
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
