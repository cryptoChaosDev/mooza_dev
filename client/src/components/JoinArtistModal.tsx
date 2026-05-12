import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { X, Search, Plus, Check, Loader2, Music2 } from 'lucide-react';
import { artistAPI, referenceAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface Props {
  onClose: () => void;
}

export default function JoinArtistModal({ onClose }: Props) {
  const navigate = useNavigate();

  const [artistQuery, setArtistQuery] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<any[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [roleQuery, setRoleQuery] = useState('');
  const [roleSuggestions, setRoleSuggestions] = useState<any[]>([]);
  const [roleSearching, setRoleSearching] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<{ id: string; name: string }[]>([]);

  const [success, setSuccess] = useState(false);

  const artistDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Artist search
  useEffect(() => {
    if (!artistQuery.trim() || artistQuery.trim().length < 2) {
      setArtistSuggestions([]); setNotFound(false); return;
    }
    if (artistDebounce.current) clearTimeout(artistDebounce.current);
    artistDebounce.current = setTimeout(async () => {
      setArtistSearching(true);
      try {
        const { data } = await artistAPI.suggest(artistQuery.trim());
        setArtistSuggestions(data);
        setNotFound(data.length === 0);
      } catch { setArtistSuggestions([]); }
      finally { setArtistSearching(false); }
    }, 300);
  }, [artistQuery]);

  // Role search
  useEffect(() => {
    if (!roleQuery.trim() || roleQuery.trim().length < 1) {
      setRoleSuggestions([]); return;
    }
    if (roleDebounce.current) clearTimeout(roleDebounce.current);
    roleDebounce.current = setTimeout(async () => {
      setRoleSearching(true);
      try {
        const { data } = await referenceAPI.getProfessions({ search: roleQuery.trim(), all: true });
        setRoleSuggestions(data);
      } catch { setRoleSuggestions([]); }
      finally { setRoleSearching(false); }
    }, 250);
  }, [roleQuery]);

  const joinMut = useMutation({
    mutationFn: () => artistAPI.requestJoin(selectedArtist!.id, selectedRoles.map(r => r.id)),
    onSuccess: () => setSuccess(true),
  });

  const toggleRole = (role: { id: string; name: string }) => {
    setSelectedRoles(prev =>
      prev.some(r => r.id === role.id)
        ? prev.filter(r => r.id !== role.id)
        : [...prev, role]
    );
  };

  const canSubmit = selectedArtist && selectedRoles.length > 0 && !joinMut.isPending;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[71] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[90vh] flex flex-col"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-base font-bold text-white">Добавить Артиста</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
              <Check size={32} className="text-emerald-400" />
            </div>
            <h4 className="text-lg font-bold text-white mb-2">Запрос направлен!</h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              После подтверждения Артист будет добавлен в ваш список Артистов.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              Требуется подтверждение администратором Артиста
            </p>

            {/* Artist search */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Название *</label>
              {selectedArtist ? (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-primary-500/10 border border-primary-500/30 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-primary-800/60 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {selectedArtist.avatar
                      ? <img src={selectedArtist.avatar} alt="" className="w-full h-full object-cover" />
                      : <Music2 size={14} className="text-primary-400" />
                    }
                  </div>
                  <span className="flex-1 text-sm font-semibold text-white">{selectedArtist.name}</span>
                  <button onClick={() => { setSelectedArtist(null); setArtistQuery(''); setNotFound(false); }}>
                    <X size={15} className="text-slate-400 hover:text-white" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    autoFocus
                    type="text"
                    value={artistQuery}
                    onChange={e => setArtistQuery(e.target.value)}
                    placeholder="Поиск"
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 transition-colors"
                  />
                  {artistSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
                </div>
              )}

              {/* Suggestions */}
              {!selectedArtist && artistSuggestions.length > 0 && (
                <div className="mt-1 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  {artistSuggestions.map(s => (
                    <button key={s.id} type="button" onClick={() => { setSelectedArtist({ id: s.id, name: s.name, avatar: s.thumb }); setArtistQuery(''); setArtistSuggestions([]); setNotFound(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 transition-colors text-left">
                      <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {s.thumb ? <img src={s.thumb} alt={s.name} className="w-full h-full object-cover" /> : <Music2 size={14} className="text-slate-400" />}
                      </div>
                      <span className="text-sm text-white">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Not found */}
              {!selectedArtist && notFound && artistQuery.trim().length >= 2 && (
                <div className="mt-1 bg-slate-800 border border-slate-700 rounded-2xl p-3 text-center space-y-2">
                  <p className="text-xs text-slate-500">Такого артиста не найдено</p>
                  <button
                    onClick={() => { onClose(); navigate('/artist/create'); }}
                    className="flex items-center gap-1.5 mx-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                  >
                    <Plus size={13} />Создать профиль Артиста
                  </button>
                </div>
              )}
            </div>

            {/* Role search */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Роль *</label>
              <p className="text-[10px] text-slate-600 mb-1.5">Если у вас несколько ролей — укажите каждую</p>

              {/* Selected roles chips */}
              {selectedRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedRoles.map(r => (
                    <div key={r.id} className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 border border-primary-500/25 rounded-xl">
                      <span className="text-xs text-primary-300 font-medium">{r.name}</span>
                      <button onClick={() => toggleRole(r)}><X size={11} className="text-primary-400/60 hover:text-red-400" /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={roleQuery}
                  onChange={e => setRoleQuery(e.target.value)}
                  placeholder="Вокал / Гитара / Барабаны"
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 transition-colors"
                />
                {roleSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
              </div>

              {roleSuggestions.length > 0 && (
                <div className="mt-1 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden max-h-40 overflow-y-auto">
                  {roleSuggestions.map((p: any) => {
                    const isSelected = selectedRoles.some(r => r.id === p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => { toggleRole({ id: p.id, name: p.name }); setRoleQuery(''); setRoleSuggestions([]); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-700 transition-colors text-left ${isSelected ? 'bg-primary-500/10' : ''}`}>
                        <span className="text-sm text-white">{p.name}</span>
                        {isSelected && <Check size={14} className="text-primary-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {roleQuery.trim().length >= 1 && !roleSearching && roleSuggestions.length === 0 && (
                <p className="mt-1 text-xs text-slate-500 text-center py-2">Такой роли не найдено</p>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={() => joinMut.mutate()}
              disabled={!canSubmit}
              className={`w-full py-3 text-sm font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 ${
                canSubmit
                  ? 'bg-primary-600 hover:bg-primary-500 text-white'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              {joinMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
              Запросить подтверждение
            </button>

            {joinMut.isError && (
              <p className="text-xs text-red-400 text-center">Ошибка при отправке. Попробуйте снова.</p>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
