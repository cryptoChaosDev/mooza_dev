import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { groupAPI } from '../lib/api';

const TYPE_OPTIONS = [
  { id: 'GROUP', name: 'Группа' },
  { id: 'COVER_GROUP', name: 'Кавер-группа' },
];

export default function GroupCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState('GROUP');

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
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Название группы *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Введите название..."
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 transition-colors"
            />
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
