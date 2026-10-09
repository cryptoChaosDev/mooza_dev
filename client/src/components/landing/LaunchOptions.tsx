import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Download, EllipsisVertical, Globe, Share, SquarePlus, Store, X } from 'lucide-react';
import { ANDROID_APK_URL } from '../../lib/androidApp';
import { detectPlatform, promptPwaInstall, useCanInstallPwa, type Platform } from '../../lib/pwaInstall';
import { reachGoal } from '../../lib/metrika';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';
import { Eyebrow } from './ui';

/**
 * «Открыть или установить» — все способы запуска Moooza сразу под hero:
 * веб, PWA на iPhone и Android, APK с сайта, RuStore (скоро). Вариант для
 * текущего устройства подсвечен; на компьютере в инструкции — QR-код для телефона.
 */

type OptionId = 'web' | 'ios' | 'android' | 'apk' | 'rustore';
type GlyphProps = { size?: number; className?: string };

// Глифы платформ — пути Simple Icons (CC0), 24×24.
function AppleGlyph({ size = 16, className = '' }: GlyphProps) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function AndroidGlyph({ size = 16, className = '' }: GlyphProps) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9-.3946 1.4473 1.9387 3.3501-.0938-.1622 1.982 3.4296.0161.0252-.4729.2131-1.1105.7302-.6177.5011-1.2458 1.1501-1.8115 1.9083-.6378.8547-1.211 1.854-1.6162 2.9688-.2067.5689-.3678 1.1647-.4791 1.7833-.0371.2072-.0694.4167-.0957.6274a1.1495 1.1495 0 0 0-.0039.0293L0 18.4414h24l-.0195-.0937c-.0251-.2096-.0574-.4181-.0938-.6245-.1104-.6159-.2703-1.2091-.4756-1.7756-.4041-1.1149-.9767-2.1161-1.6143-2.9727-.5658-.7613-1.1939-1.4127-1.8125-1.9161-.638-.5194-1.1278-.7092-1.1113-.7344 2.0758-3.5917.0434.0797 1.9832-3.4245.3207-.5508.0779-1.1709-.4002-1.4519-.4768-.2817-1.0522-.1584-1.3828.2065a1.1468 1.1468 0 0 0-.1387.1915zM6.6367 13.871a1.0117 1.0117 0 0 1 1.0117 1.0117 1.0117 1.0117 0 0 1-1.0117 1.0137 1.0117 1.0117 0 0 1-1.0137-1.0137 1.0117 1.0117 0 0 1 1.0137-1.0117zm10.7286 0a1.0117 1.0117 0 0 1 1.0117 1.0117 1.0117 1.0117 0 0 1-1.0117 1.0137 1.0117 1.0117 0 0 1-1.0137-1.0137 1.0117 1.0117 0 0 1 1.0137-1.0117z" />
    </svg>
  );
}

// label/tag — «пилюли» на sm+; short/sub — плитки в один ряд на телефоне.
const OPTIONS: { id: OptionId; label: string; tag?: string; short: string; sub: string; icon: (p: GlyphProps) => ReactNode; aria: string }[] = [
  { id: 'web', label: 'Веб-версия', short: 'Веб', sub: 'браузер', icon: (p) => <Globe {...p} />, aria: 'Открыть Moooza в браузере' },
  { id: 'ios', label: 'iPhone', tag: 'PWA', short: 'iPhone', sub: 'PWA', icon: (p) => <AppleGlyph {...p} />, aria: 'Установить на iPhone — экран «Домой»' },
  { id: 'android', label: 'Android', tag: 'PWA', short: 'Android', sub: 'PWA', icon: (p) => <AndroidGlyph {...p} />, aria: 'Установить на Android из браузера' },
  { id: 'apk', label: 'Android', tag: 'APK', short: 'Android', sub: 'APK', icon: (p) => <Download {...p} />, aria: 'Скачать приложение для Android (APK)' },
  { id: 'rustore', label: 'RuStore', short: 'RuStore', sub: 'скоро', icon: (p) => <Store {...p} />, aria: 'RuStore' },
];

function recommendedFor(platform: Platform, apkEnabled: boolean): OptionId {
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return apkEnabled ? 'apk' : 'android';
  return 'web';
}

export default function LaunchOptions({ apkEnabled }: { apkEnabled: boolean }) {
  const [platform] = useState<Platform>(() => detectPlatform());
  const canInstall = useCanInstallPwa();
  const [open, setOpen] = useState<Exclude<OptionId, 'web' | 'rustore'> | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const recommended = recommendedFor(platform, apkEnabled);

  const choose = async (id: OptionId) => {
    reachGoal('launch_option_click', { option: id, platform });
    if (id === 'web' || id === 'rustore') return;
    // Android в Chrome: сразу системный диалог установки вместо инструкции.
    if (id === 'android' && platform === 'android' && canInstall) {
      await promptPwaInstall();
      return;
    }
    setOpen(id);
  };

  const pill = (active: boolean, disabled: boolean) =>
    `inline-flex items-center gap-2 min-h-[44px] rounded-full pl-3.5 pr-4 text-[14px] font-medium whitespace-nowrap transition-colors ${
      disabled
        ? 'bg-white/[0.025] text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)] cursor-default'
        : active
          ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(127,227,245,0.5)] hover:bg-white/[0.12]'
          : 'bg-white/[0.04] text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] hover:text-white hover:bg-white/[0.07]'
    }`;
  const tileIcon = (active: boolean, disabled: boolean) =>
    `w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
      disabled
        ? 'bg-white/[0.025] text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]'
        : active
          ? 'bg-white/[0.09] text-[#7fe3f5] shadow-[inset_0_0_0_1px_rgba(127,227,245,0.55)]'
          : 'bg-white/[0.045] text-slate-200 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]'
    }`;

  const items = OPTIONS.map((o) => {
    const soon = o.id === 'rustore' || (o.id === 'apk' && !apkEnabled);
    return { ...o, soon, active: !soon && o.id === recommended };
  });

  return (
    <div>
      <Eyebrow>Открыть или установить</Eyebrow>

      {/* Телефон: пять плиток в один ряд — все варианты на первом экране */}
      <div className="mt-3 grid grid-cols-5 gap-1 max-w-sm mx-auto sm:hidden">
        {items.map(({ soon, active, ...o }) => {
          const inner = (
            <>
              <span className={tileIcon(active, soon)}>{o.icon({ size: 20 })}</span>
              <span className={`mt-1.5 text-[12px] font-medium leading-tight ${soon ? 'text-slate-500' : active ? 'text-white' : 'text-slate-300'}`}>{o.short}</span>
              <span className={`text-[10.5px] leading-tight ${active ? 'text-[#7fe3f5]' : 'text-slate-500'}`}>{soon ? 'скоро' : o.sub}</span>
            </>
          );
          const cls = 'flex flex-col items-center py-1.5 rounded-2xl min-w-0';
          if (o.id === 'web') {
            return <Link key={o.id} to="/feed" aria-label={o.aria} onClick={() => choose('web')} className={cls}>{inner}</Link>;
          }
          return (
            <button
              key={o.id}
              type="button"
              aria-label={soon ? `${o.aria} — скоро` : o.aria}
              aria-disabled={soon || undefined}
              onClick={soon ? undefined : () => { void choose(o.id); }}
              className={`${cls} ${soon ? 'cursor-default' : ''}`}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {/* sm+: «пилюли» в одну строку */}
      <div className="mt-4 hidden sm:flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
        {items.map(({ soon, active, ...o }) => {
          const content = (
            <>
              {o.icon({ size: 16, className: active ? 'text-[#7fe3f5]' : '' })}
              {o.label}
              {o.tag && <span className="text-[10.5px] font-semibold tracking-[0.08em] text-slate-500">{o.tag}</span>}
              {soon && (
                <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">скоро</span>
              )}
            </>
          );
          if (o.id === 'web') {
            return (
              <Link key={o.id} to="/feed" aria-label={o.aria} onClick={() => choose('web')} className={pill(active, false)}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={o.id}
              type="button"
              aria-label={soon ? `${o.aria} — скоро` : o.aria}
              aria-disabled={soon || undefined}
              onClick={soon ? undefined : () => { void choose(o.id); }}
              className={pill(active, soon)}
            >
              {content}
            </button>
          );
        })}
      </div>

      {open && <InstallDialog option={open} platform={platform} onClose={close} />}
    </div>
  );
}

// ─── Инструкция по установке ──────────────────────────────────────────────────

function InstallDialog({ option, platform, onClose }: {
  option: 'ios' | 'android' | 'apk';
  platform: Platform;
  onClose: () => void;
}) {
  useEffect(() => {
    lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unlockScroll(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const origin = window.location.origin;
  const host = window.location.host;
  // Инструкция не для этого устройства — даём QR, чтобы открыть на телефоне.
  const onTarget = option === 'ios' ? platform === 'ios' : platform === 'android';
  const qrUrl = option === 'apk' ? `${origin}${ANDROID_APK_URL}` : `${origin}/`;

  const content = {
    ios: {
      title: 'Moooza на iPhone',
      lead: <>Добавьте Moooza на&nbsp;экран «Домой»&nbsp;— она откроется как приложение: на&nbsp;весь экран и&nbsp;с&nbsp;уведомлениями. Из&nbsp;App&nbsp;Store ничего скачивать не&nbsp;нужно.</>,
      steps: [
        <>Откройте <b className="text-white font-medium">{host}</b> в&nbsp;Safari</>,
        <>Нажмите «Поделиться» <Share size={15} className="inline -mt-1 text-[#7fe3f5]" /> на&nbsp;панели Safari</>,
        <>Выберите «На&nbsp;экран „Домой“» <SquarePlus size={15} className="inline -mt-1 text-[#7fe3f5]" />&nbsp;— если пункта не&nbsp;видно, прокрутите список</>,
        <>Нажмите «Добавить»&nbsp;— иконка Moooza появится на&nbsp;экране</>,
      ],
      note: 'Уведомления на iPhone работают с iOS 16.4 — у приложения, добавленного на экран «Домой».',
      qrCaption: 'Наведите камеру iPhone — откроется Moooza в Safari',
    },
    android: {
      title: 'Moooza на Android',
      lead: <>Установите Moooza прямо из&nbsp;браузера&nbsp;— без магазина и&nbsp;файлов. Приложение обновляется само.</>,
      steps: [
        <>Откройте <b className="text-white font-medium">{host}</b> в&nbsp;Chrome</>,
        <>Нажмите меню <EllipsisVertical size={15} className="inline -mt-1 text-[#7fe3f5]" /> в&nbsp;правом верхнем углу</>,
        <>Выберите «Установить приложение» или «Добавить на&nbsp;главный экран»</>,
      ],
      note: 'В Яндекс Браузере и Samsung Internet пункт называется похоже — ищите его в меню браузера.',
      qrCaption: 'Наведите камеру Android-телефона — откроется Moooza',
    },
    apk: {
      title: 'Приложение для Android',
      lead: <>Файл APK для установки напрямую с&nbsp;сайта. Скоро Moooza появится и&nbsp;в&nbsp;RuStore.</>,
      steps: [
        <>Скачайте файл <b className="text-white font-medium">moooza.apk</b></>,
        <>Откройте его из&nbsp;уведомления о&nbsp;загрузке или из&nbsp;папки «Загрузки»</>,
        <>Если телефон спросит&nbsp;— разрешите установку из&nbsp;браузера</>,
        <>Нажмите «Установить»</>,
      ],
      note: 'Содержимое приложения обновляется само — переустанавливать после каждого обновления Moooza не нужно.',
      qrCaption: 'Наведите камеру Android-телефона — начнётся загрузка APK',
    },
  }[option];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={content.title}>
      <div className="absolute inset-0 bg-black/70 animate-fadeIn" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-[#0b1224] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16),0_30px_80px_-20px_rgba(0,0,0,0.8)] animate-slideUp sm:animate-fadeIn"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-white">{content.title}</h3>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="-mr-2 -mt-1 w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="px-6">
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{content.lead}</p>

          {option === 'apk' && platform === 'android' && (
            <a
              href={ANDROID_APK_URL}
              onClick={() => reachGoal('android_apk_click', { from: 'landing_launch' })}
              className="mt-5 flex items-center justify-center gap-2 min-h-[52px] rounded-2xl bg-white text-slate-950 text-[16px] font-semibold hover:bg-slate-100 transition-colors"
            >
              <Download size={18} /> Скачать APK
            </a>
          )}

          {!onTarget && <QrCode url={qrUrl} caption={content.qrCaption} />}

          <ol className="mt-5 space-y-3">
            {content.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug text-slate-300">
                <span className="mt-[1px] w-6 h-6 flex-shrink-0 rounded-full bg-white/[0.07] text-[12px] font-semibold text-slate-200 flex items-center justify-center">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[13px] leading-relaxed text-slate-500">{content.note}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function QrCode({ url, caption }: { url: string; caption: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((mod: any) => (mod.default ?? mod).toDataURL(url, {
        width: 360, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#020617', light: '#ffffff' },
      }))
      .then((data: string) => { if (alive) setSrc(data); })
      .catch(() => { /* без QR — остаются шаги */ });
    return () => { alive = false; };
  }, [url]);
  return (
    <div className="mt-5 flex items-center gap-4 rounded-2xl bg-white/[0.03] p-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
      <div className="w-[112px] h-[112px] flex-shrink-0 rounded-xl bg-white overflow-hidden">
        {src && <img src={src} width={112} height={112} alt="" className="w-full h-full" />}
      </div>
      <p className="text-[14px] leading-snug text-slate-300">{caption}</p>
    </div>
  );
}
