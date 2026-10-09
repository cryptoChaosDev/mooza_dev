import type { ReactNode } from 'react';
import type { Transition } from 'framer-motion';

/** Общие кирпичики лендинга: появление, капс-лейбл, заголовок секции, карточка. */

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Плавное появление при прокрутке (один раз). transform/opacity — без layout. */
export const fadeUp = (delay = 0, y = 24) => ({
  initial: { opacity: 0, y },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true as const, margin: '0px 0px -8% 0px' },
  transition: { duration: 0.7, delay, ease: EASE } as Transition,
});

export const TELEGRAM_CHANNEL_URL = 'https://t.me/moooza_jobs';

/** Мелкий капс-лейбл секции с градиентной чёрточкой. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 ${className}`}>
      <span aria-hidden className="h-px w-6 bg-gradient-to-r from-[#40d6f0] to-[#a855f7]" />
      {children}
    </p>
  );
}

/** 1–2 слова с фирменным градиентом. */
export function Grad({ children }: { children: ReactNode }) {
  return <span className="lp-grad-text">{children}</span>;
}

/** Заголовок секции: лейбл + крупный h2 + подзаголовок. */
export function SectionHead({
  eyebrow, title, sub, center = false, className = '',
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={`${center ? 'text-center mx-auto' : ''} max-w-2xl ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-[2rem] leading-[1.06] sm:text-5xl sm:leading-[1.04] font-semibold tracking-[-0.035em] text-white text-balance">
        {title}
      </h2>
      {sub && (
        <p className={`mt-4 text-base sm:text-lg leading-relaxed text-slate-400 text-balance ${center ? 'mx-auto' : ''} max-w-xl`}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * Стеклянная карточка с тонкой градиентной обводкой. backdrop-blur — утилитой
 * Tailwind, чтобы на Android его снимал глобальный android-no-backdrop-blur.
 */
export function GlassCard({
  children, className = '', strong = false, lift = true, as: Tag = 'div', id,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  lift?: boolean;
  as?: 'div' | 'article' | 'section';
  id?: string;
}) {
  return (
    <Tag
      id={id}
      className={`lp-card lp-ring ${strong ? 'lp-ring-strong' : ''} ${lift ? 'lp-lift' : ''} rounded-[28px] backdrop-blur-md overflow-hidden ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Мягкое свечение за элементом (radial-gradient вместо filter: blur). */
export function Glow({ className = '', color = 'violet' }: { className?: string; color?: 'violet' | 'cyan' | 'mix' }) {
  const bg = color === 'cyan'
    ? 'radial-gradient(closest-side, rgba(64,214,240,0.22), rgba(64,214,240,0) 100%)'
    : color === 'mix'
      ? 'radial-gradient(closest-side, rgba(110,150,247,0.24), rgba(150,108,246,0.08) 60%, rgba(150,108,246,0) 100%)'
      : 'radial-gradient(closest-side, rgba(150,108,246,0.26), rgba(150,108,246,0) 100%)';
  return <div aria-hidden className={`pointer-events-none absolute ${className}`} style={{ background: bg }} />;
}

/** Круглый «аватар» с инициалами и градиентом — для мокапов. */
export function MockAvatar({
  initials, className = '', from = '#40d6f0', to = '#966cf6',
}: {
  initials: string;
  className?: string;
  from?: string;
  to?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white/95 flex-shrink-0 ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials}
    </span>
  );
}
