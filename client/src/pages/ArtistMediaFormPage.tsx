import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Disc3, Clapperboard } from 'lucide-react';
import MediaItemForm from '../components/MediaItemForm';

/**
 * Страница добавления релиза/клипа артиста — /artist/:id/releases/new и
 * /artist/:id/clips/new (одна страница, kind задаётся роутом). Заменяет нижние
 * листы MediaItemForm на ArtistPage: единая механика «форма = отдельная
 * страница» (как /orders/new, /artist/:id/edit). MediaItemForm сам инвалидирует
 * ['releases'|'clips','artist',id] и по успеху зовёт onClose → navigate(-1).
 */
export default function ArtistMediaFormPage({ kind }: { kind: 'release' | 'clip' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isRelease = kind === 'release';
  const Icon = isRelease ? Disc3 : Clapperboard;

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
          <Icon size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">{isRelease ? 'Новый релиз' : 'Новый клип'}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {id && <MediaItemForm kind={kind} artistId={id} asPage onClose={() => navigate(-1)} />}
      </div>
    </div>
  );
}
