// Shared single-select options for the «Вакансия» feature (раздел 3 плана).
// id (stored value) + label (русский лейбл). Used by VacancyForm, VacancyDetailPage,
// VacanciesPage and the feed card.

export type Option = { id: string; label: string };

export const WORK_FORMAT_OPTIONS: Option[] = [
  { id: 'online', label: 'Онлайн' },
  { id: 'offline', label: 'Офлайн' },
  { id: 'hybrid', label: 'Гибрид' },
];

export const GEOGRAPHY_OPTIONS: Option[] = [
  { id: 'city', label: 'В своём городе' },
  { id: 'region', label: 'В своём регионе' },
  { id: 'country', label: 'По всей стране' },
  { id: 'international', label: 'Международная занятость' },
];

export const EMPLOYMENT_OPTIONS: Option[] = [
  { id: 'permanent', label: 'Постоянная' },
  { id: 'partial', label: 'Частичная (совмещение)' },
  { id: 'project', label: 'Проектная' },
  { id: 'intern', label: 'Стажёр' },
  { id: 'volunteer', label: 'Волонтёр' },
];

export const PAYMENT_OPTIONS: Option[] = [
  { id: 'free', label: 'Бесплатно' },
  { id: 'barter', label: 'Бартер' },
  { id: 'percent', label: 'Процент' },
  { id: 'rate', label: 'Ставка' },
];

// paymentType values that reveal the «Размер вознаграждения» numeric input.
export const PAYMENT_WITH_COMPENSATION = new Set(['percent', 'rate']);

function labelFrom(options: Option[], id?: string | null): string {
  if (!id) return '';
  return options.find((o) => o.id === id)?.label ?? id;
}

export const workFormatLabel = (id?: string | null) => labelFrom(WORK_FORMAT_OPTIONS, id);
export const geographyLabel = (id?: string | null) => labelFrom(GEOGRAPHY_OPTIONS, id);
export const employmentLabel = (id?: string | null) => labelFrom(EMPLOYMENT_OPTIONS, id);
export const paymentLabel = (id?: string | null) => labelFrom(PAYMENT_OPTIONS, id);

// occupancyStatus badge (ТЗ 3.4): open/considering/closed/'' (Не указан).
export function occupancyLabel(status?: string | null): string {
  switch (status) {
    case 'open':
      return 'Открыт';
    case 'considering':
      return 'Рассматриваю';
    case 'closed':
      return 'Закрыт';
    default:
      return 'Не указан';
  }
}

export function occupancyBadgeClass(status?: string | null): string {
  switch (status) {
    case 'open':
      return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
    case 'considering':
      return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
    case 'closed':
      return 'text-red-400 border-red-500/20 bg-red-500/10';
    default:
      return 'text-slate-400 border-slate-700/60 bg-slate-800/40';
  }
}
