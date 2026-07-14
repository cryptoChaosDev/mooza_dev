import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase } from 'lucide-react';
import VacancyForm from '../components/VacancyForm';

/**
 * Страница создания Вакансии от имени артиста — /artist/:id/vacancies/new.
 * Тонкая обёртка над VacancyForm (как OrderFormPage над OrderForm): форма сама
 * сохраняет, инвалидирует ['vacancies','mine',artistId] и зовёт onClose.
 */
export default function ArtistVacancyNewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      <div
        className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <Briefcase size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Новая вакансия</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <VacancyForm artistId={id} onClose={() => navigate(-1)} />
      </div>
    </div>
  );
}
