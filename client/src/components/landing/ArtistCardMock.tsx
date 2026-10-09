import { ChevronRight, Disc3, Headphones, Music2, QrCode, Ticket, Waves } from 'lucide-react';
import { MockAvatar } from './ui';

/**
 * Мокап визитки артиста («ссылка в био») в телефоне — чистый HTML/CSS, без
 * картинок. Имя, площадки и даты — вымышленные, только для иллюстрации.
 */

const PLATFORMS = [
  { label: 'Яндекс Музыка', icon: Music2, tint: 'bg-[#ffdb4d] text-slate-900' },
  { label: 'VK Музыка', icon: Waves, tint: 'bg-[#2787f5] text-white' },
  { label: 'Звук', icon: Headphones, tint: 'bg-gradient-to-br from-[#6d5dfc] to-[#e64fd9] text-white' },
];

// Псевдо-QR 21×21: три «глаза» по углам + детерминированный шум.
const QR_PATH = (() => {
  const n = 21;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inEye = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inEye(x, y)) continue;
      if (rnd() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  // глаза: рамка 7×7 и ядро 3×3
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    d += `M${ox} ${oy}h7v7h-7zM${ox + 1} ${oy + 1}v5h5v-5z`;
    d += `M${ox + 2} ${oy + 2}h3v3h-3z`;
  }
  return d;
})();

function FakeQr({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="-1 -1 23 23" className={className} aria-hidden shapeRendering="crispEdges">
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      <path d={QR_PATH} fill="#0b1020" fillRule="evenodd" />
    </svg>
  );
}

export default function ArtistCardMock() {
  return (
    <div className="relative mx-auto w-[236px] sm:w-[248px] mb-9" aria-hidden>
      {/* Телефон */}
      <div className="relative rounded-[2.5rem] p-[6px] bg-gradient-to-b from-slate-600/70 via-slate-800 to-slate-900 shadow-[0_40px_80px_-30px_rgba(150,108,246,0.55),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="relative rounded-[2.1rem] overflow-hidden bg-[#060a17] h-[492px]">
          {/* Обложка */}
          <div
            className="h-[104px]"
            style={{
              backgroundImage:
                'radial-gradient(120% 90% at 15% 0%, rgba(64,214,240,0.55), transparent 60%), radial-gradient(110% 100% at 100% 10%, rgba(168,85,247,0.6), transparent 62%), linear-gradient(180deg, #111a33, #060a17)',
            }}
          />
          {/* «Остров» */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[74px] h-[22px] rounded-full bg-black" />

          <div className="px-3.5 -mt-9 text-center">
            <MockAvatar initials="СО" className="w-[68px] h-[68px] text-lg ring-4 ring-[#060a17]" from="#40d6f0" to="#a855f7" />
            <p className="mt-2 text-[15px] font-semibold text-white leading-tight">Синие окна</p>
            <p className="text-[11px] text-slate-400 mt-0.5">инди-рок · Самара</p>
            <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-slate-300">
              <span className="truncate">moooza.ru/artist/sinie-okna</span>
            </p>

            {/* Площадки */}
            <div className="mt-3 space-y-1.5 text-left">
              {PLATFORMS.map((p) => (
                <div key={p.label} className="flex items-center gap-2.5 h-9 rounded-xl bg-white/[0.05] pl-1.5 pr-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${p.tint}`}>
                    <p.icon size={13} strokeWidth={2.4} />
                  </span>
                  <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-100 truncate">{p.label}</span>
                  <ChevronRight size={13} className="text-slate-500 flex-shrink-0" />
                </div>
              ))}
            </div>

            {/* Последний релиз */}
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-white/[0.07] to-white/[0.03] p-1.5 text-left">
              <span
                className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{ backgroundImage: 'conic-gradient(from 210deg at 60% 40%, #40d6f0, #966cf6, #ec4899, #40d6f0)' }}
              >
                <Disc3 size={16} className="text-white/85" />
              </span>
              <span className="min-w-0">
                <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#40d6f0]">Новый релиз</span>
                <span className="block text-[12px] font-semibold text-white truncate">Ночной трамвай</span>
              </span>
            </div>

            {/* Ближайший концерт */}
            <div className="mt-1.5 flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-1.5 text-left">
              <span className="w-10 h-10 rounded-lg flex-shrink-0 bg-slate-900 flex flex-col items-center justify-center leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                <span className="text-[13px] font-bold text-white">15</span>
                <span className="text-[8.5px] uppercase text-slate-400 mt-0.5">нояб</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-white truncate">Казань, клуб</span>
                <span className="block text-[10px] text-slate-400">Ближайший концерт</span>
              </span>
              <Ticket size={14} className="text-slate-400 flex-shrink-0 mr-1" />
            </div>
          </div>
          {/* Полоска «домой» — внизу экрана свободное поле под плашку статистики */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-white/25" />
        </div>
      </div>

      {/* QR для афиши — поверх обложки, контент визитки не перекрывает */}
      <div className="lp-float absolute -right-5 sm:-right-9 top-[26px] w-[78px] rounded-2xl bg-white p-1.5 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)]">
        <FakeQr className="w-full h-auto rounded-md" />
        <p className="mt-1 mb-0.5 flex items-center justify-center gap-1 text-[9px] font-semibold text-slate-800 leading-none">
          <QrCode size={10} /> для афиши
        </p>
      </div>

      {/* Статистика переходов — приколота к низу телефона */}
      <div className="absolute inset-x-0 -bottom-9 flex justify-center">
        <div
          className="lp-float flex items-center gap-3 rounded-2xl bg-slate-900/95 pl-3 pr-3.5 py-2.5 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.85),inset_0_0_0_1px_rgba(148,163,184,0.18)]"
          style={{ animationDelay: '-3s' }}
        >
          <div className="flex items-end gap-[3px] h-8 w-[70px]">
            {[38, 52, 44, 66, 58, 82, 100].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm bg-gradient-to-t from-[#40d6f0]/60 to-[#966cf6]"
                style={{ height: `${h}%`, opacity: 0.55 + i * 0.065 }}
              />
            ))}
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-white">Переходы</p>
            <p className="text-[9.5px] text-slate-400 whitespace-nowrap">по&nbsp;площадкам за&nbsp;неделю</p>
          </div>
        </div>
      </div>
    </div>
  );
}
