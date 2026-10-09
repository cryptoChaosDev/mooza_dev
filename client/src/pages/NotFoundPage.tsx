import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useSeo, seoTitle, ROBOTS_NOINDEX } from '../lib/seo';

// Неизвестный адрес — честная «Страница не найдена» вместо прежнего
// редиректа на главную (план, раздел A: `*` → NotFoundPage).
export default function NotFoundPage({
  title = 'Страница не найдена',
  text = 'Возможно, ссылка устарела или в адресе опечатка.',
}: { title?: string; text?: string }) {
  useSeo({ title: seoTitle(title), robots: ROBOTS_NOINDEX });
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-800/70 border border-slate-700 flex items-center justify-center mb-4">
        <Compass size={26} className="text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">{title}</h1>
      <p className="text-sm text-slate-400 max-w-xs mb-6">{text}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link to="/" className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors">
          На главную
        </Link>
        <Link to="/search" className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors">
          Каталог
        </Link>
      </div>
    </div>
  );
}
