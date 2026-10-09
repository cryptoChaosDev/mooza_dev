import { m } from 'framer-motion';
import { ArrowUpRight, Eye, MapPin, Send, Target, Wallet } from 'lucide-react';
import { GlassCard, Glow, Grad, SectionHead, TELEGRAM_CHANNEL_URL, fadeUp } from './ui';

/**
 * Блок Telegram-канала @moooza_jobs: текст + кнопка «Подписаться» и мокап
 * поста канала (формат — как у автопостинга заказов, без эмодзи).
 */

function PostMock() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[400px]">
      {/* Шапка канала */}
      <div className="flex items-center gap-3 px-1">
        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#40d6f0] to-[#966cf6] flex items-center justify-center text-[13px] font-bold text-white">M</span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-white leading-tight">MOOOZA | Работа</p>
          <p className="text-[11.5px] text-slate-400">канал · @moooza_jobs</p>
        </div>
      </div>

      {/* Предыдущий пост — приглушён */}
      <div className="mt-4 rounded-2xl rounded-bl-md bg-slate-800/50 px-4 py-3 opacity-50">
        <p className="text-[13px] font-semibold text-white">Вакансия</p>
        <p className="text-[13px] text-slate-300">Гитарист в&nbsp;кавер-группу · Москва</p>
      </div>

      {/* Свежий пост */}
      <div className="mt-2 rounded-2xl rounded-bl-md bg-slate-800/90 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(148,163,184,0.1)] overflow-hidden">
        <div className="px-4 pt-3.5 pb-3 text-[13.5px] leading-relaxed text-slate-100">
          <p className="flex items-center gap-1.5 font-semibold text-white"><Target size={14} className="text-[#40d6f0]" />Заказ</p>
          <p className="mt-1 font-medium text-white">Барабанщик на&nbsp;концерт, метал</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-slate-300"><MapPin size={13} className="text-slate-400 flex-shrink-0" />Самара · 20&nbsp;ноября</p>
          <p className="flex items-center gap-1.5 text-slate-300"><Wallet size={13} className="text-slate-400 flex-shrink-0" />Бюджет: до&nbsp;10&nbsp;000&nbsp;₽</p>
          <p className="mt-2 text-sky-300">#самара #барабанщик #метал</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-slate-500"><Eye size={11} />12:04</p>
        </div>
        <div className="border-t border-white/5 bg-white/[0.03] py-2.5 text-center text-[13px] font-semibold text-sky-300">
          Откликнуться на&nbsp;Moooza
        </div>
      </div>
    </div>
  );
}

export default function TelegramBlock() {
  return (
    <section id="telegram" className="relative px-4 sm:px-6 py-16 sm:py-24 overflow-x-clip">
      <div className="max-w-6xl mx-auto">
        <m.div {...fadeUp()} className="relative">
          <Glow color="cyan" className="-inset-x-10 -inset-y-20" />
          <GlassCard strong lift={false} className="relative px-5 py-10 sm:p-12 lg:p-14">
            <div className="grid grid-cols-1 gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
              <div>
                <SectionHead
                  eyebrow="Telegram-канал"
                  title={<>Заказы приходят <Grad>в&nbsp;Telegram</Grad></>}
                  sub={<>В&nbsp;<span className="text-slate-200">@moooza_jobs</span> публикуем свежие заказы и&nbsp;вакансии. Хэштеги города, профессии и&nbsp;жанра помогут найти свои за&nbsp;секунды.</>}
                />
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <a
                    href={TELEGRAM_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center justify-center gap-2 min-h-[52px] px-7 rounded-2xl bg-[#2aabee] hover:bg-[#3bb5f2] text-white text-[15px] font-semibold transition-colors shadow-[0_16px_40px_-16px_rgba(42,171,238,0.8)]"
                  >
                    <Send size={17} />
                    Подписаться
                    <ArrowUpRight size={16} className="opacity-80 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                  <span className="hidden sm:inline-flex items-center min-h-[44px] text-sm text-slate-500">t.me/moooza_jobs</span>
                </div>
              </div>
              <PostMock />
            </div>
          </GlassCard>
        </m.div>
      </div>
    </section>
  );
}
