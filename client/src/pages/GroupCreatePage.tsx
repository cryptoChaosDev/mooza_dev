import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { groupAPI, artistAPI } from '../lib/api';

const TYPE_OPTIONS = [
  { id: 'GROUP', name: 'Группа' },
  { id: 'COVER_GROUP', name: 'Кавер-группа' },
];

type Suggestion = { id: string; name: string; thumb: string | null; genres: { id: string; name: string }[] };

export default function GroupCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState('GROUP');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fromCatalog, setFromCatalog] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNameChange = (value: string) => {
    setName(value);
    setFromCatalog(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await artistAPI.suggest(value.trim());
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
  };

  const applySuggestion = (s: Suggestion) => {
    setName(s.name);
    setFromCatalog(true);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const createMutation = useMutation({
    mutationFn: () => groupAPI.create({ name, description, city, type }),
    onSuccess: ({ data }: any) => {
      navigate(`/groups/${data.id}`);
    },
  });

  const canSubmit = name.trim().length > 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Создать группу</h1>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          >
            {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Создать
          </button>
        </div>

        <div className="p-4 space-y-5">

          {/* Info block */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-400 leading-relaxed">
            После создания группа будет в статусе <span className="text-slate-300 font-medium">Черновик</span>. Вы сможете добавить участников, а затем отправить на модерацию для публикации в каталоге.
          </div>

          {/* Name */}
          <div ref={suggestRef} className="relative">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Название группы *</label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Введите название..."
              autoComplete="off"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 transition-colors"
            />
            {fromCatalog && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-primary-400">
                <Sparkles size={11} />
                Данные подтянуты из каталога — можешь изменить
              </div>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 transition-colors text-left"
                  >
                    {s.thumb
                      ? <img src={s.thumb} alt={s.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-lg bg-slate-700 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{s.name}</p>
                      {s.genres.length > 0 && (
                        <p className="text-xs text-slate-400 truncate">{s.genres.map(g => g.name).join(', ')}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Тип</label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setType(opt.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    type === opt.id
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Город</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Москва"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Описание</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Расскажите о группе..."
              rows={4}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 transition-colors resize-none"
            />
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-400 text-center">Ошибка при создании. Попробуйте снова.</p>
          )}
        </div>
      </div>
    </div>
  );
}
