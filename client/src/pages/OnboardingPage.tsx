import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, X, Search, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { userAPI, authAPI, referenceAPI } from '../lib/api';

interface SelectedProfession {
  professionId: string;
  professionName: string;
  directionName?: string;
}

interface ProfessionResult {
  id: string;
  name: string;
  direction?: { name: string };
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 0: Name
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [nicknameTaken, setNicknameTaken] = useState(false);
  const nicknameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1: Profession
  const [profSearch, setProfSearch] = useState('');
  const [profResults, setProfResults] = useState<ProfessionResult[]>([]);
  const [profLoading, setProfLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProfs, setSelectedProfs] = useState<SelectedProfession[]>([]);
  const profTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Nickname check
  useEffect(() => {
    const trimmed = nickname.trim();
    if (!trimmed || trimmed.length < 2 || trimmed === user?.nickname) {
      setNicknameTaken(false);
      return;
    }
    setNicknameChecking(true);
    if (nicknameTimer.current) clearTimeout(nicknameTimer.current);
    nicknameTimer.current = setTimeout(async () => {
      try {
        const { data } = await authAPI.checkNickname(trimmed);
        setNicknameTaken(!data.available);
      } catch { setNicknameTaken(false); }
      finally { setNicknameChecking(false); }
    }, 500);
    return () => { if (nicknameTimer.current) clearTimeout(nicknameTimer.current); };
  }, [nickname, user?.nickname]);

  // Profession search
  useEffect(() => {
    const q = profSearch.trim();
    if (!q) { setProfResults([]); setShowDropdown(false); return; }
    setProfLoading(true);
    if (profTimer.current) clearTimeout(profTimer.current);
    profTimer.current = setTimeout(async () => {
      try {
        const { data } = await referenceAPI.getProfessions({ search: q, all: true });
        const filtered = (data as ProfessionResult[]).filter(p =>
          !selectedProfs.some(s => s.professionId === p.id)
        );
        setProfResults(filtered);
        setShowDropdown(true);
      } catch { setProfResults([]); }
      finally { setProfLoading(false); }
    }, 300);
    return () => { if (profTimer.current) clearTimeout(profTimer.current); };
  }, [profSearch, selectedProfs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          profInputRef.current && !profInputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addProfession = (p: ProfessionResult) => {
    if (selectedProfs.length >= 10) return;
    setSelectedProfs(prev => [...prev, { professionId: p.id, professionName: p.name, directionName: p.direction?.name }]);
    setProfSearch('');
    setProfResults([]);
    setShowDropdown(false);
    profInputRef.current?.focus();
  };

  const step0Valid = firstName.trim().length > 0 && lastName.trim().length > 0 && !nicknameTaken;

  const saveStep0 = async () => {
    setLoading(true);
    setError('');
    try {
      const payload: any = { firstName: firstName.trim(), lastName: lastName.trim() };
      if (nickname.trim()) payload.nickname = nickname.trim();
      const { data } = await userAPI.updateMe(payload);
      setUser(data);
      setStep(1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сохранения');
    } finally { setLoading(false); }
  };

  const saveProfessions = async () => {
    if (selectedProfs.length === 0) { navigate('/'); return; }
    setLoading(true);
    try {
      const { data } = await userAPI.updateMe({
        userProfessions: selectedProfs.map(p => ({ professionId: p.professionId })),
      });
      setUser(data);
    } catch { /* ignore */ }
    finally { navigate('/'); }
  };

  // Step 0 — Name / Nickname
  if (step === 0) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-4xl mb-3">👋</div>
          <h1 className="text-2xl font-bold text-white mb-2">Добро пожаловать!</h1>
          <p className="text-sm text-slate-400">Данные подтянулись из ВКонтакте — можете изменить их прямо сейчас.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Имя" required>
              <input
                value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="Иван" autoFocus
                className="w-full px-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-sm"
              />
            </Field>
            <Field label="Фамилия" required>
              <input
                value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="Иванов"
                className="w-full px-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-sm"
              />
            </Field>
          </div>

          <Field label="Никнейм" hint="Необязательно — короткое имя для поиска">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
              <input
                value={nickname}
                onChange={e => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                placeholder="username"
                className={`w-full pl-8 pr-10 py-3.5 bg-slate-800/70 border rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all text-sm ${
                  nicknameTaken ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700/60 focus:ring-primary-500/50'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {nicknameChecking && <Loader2 size={15} className="animate-spin text-slate-500" />}
                {!nicknameChecking && nickname.trim().length >= 2 && !nicknameTaken && <Check size={15} className="text-emerald-400" />}
                {!nicknameChecking && nicknameTaken && <X size={15} className="text-red-400" />}
              </div>
            </div>
            {nicknameTaken && <p className="text-xs text-red-400 mt-1">Никнейм занят, введите другой</p>}
          </Field>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={saveStep0}
            disabled={!step0Valid || loading}
            className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            Далее
          </button>
          <button onClick={() => setStep(1)} className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Пропустить
          </button>
        </div>
      </div>
    </div>
  );

  // Step 1 — Profession
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-4xl mb-3">🎸</div>
          <h1 className="text-2xl font-bold text-white mb-2">Ваша профессия</h1>
          <p className="text-sm text-slate-400">Укажите хотя бы одну профессию — так вас найдут нужные люди.</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700/60 rounded-2xl px-4 py-3.5 focus-within:ring-2 focus-within:ring-primary-500/50 transition-all">
              {profLoading ? <Loader2 size={16} className="text-slate-500 flex-shrink-0 animate-spin" /> : <Search size={16} className="text-slate-500 flex-shrink-0" />}
              <input
                ref={profInputRef}
                value={profSearch}
                onChange={e => setProfSearch(e.target.value)}
                onFocus={() => profSearch.trim() && setShowDropdown(true)}
                placeholder="Начните вводить и выберите из списка"
                className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 focus:outline-none"
                autoFocus
              />
              {profSearch && <button onClick={() => { setProfSearch(''); setShowDropdown(false); }}><X size={14} className="text-slate-500" /></button>}
            </div>

            {showDropdown && profResults.length > 0 && (
              <div ref={dropdownRef} className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto">
                {profResults.map(p => (
                  <button key={p.id} onMouseDown={e => { e.preventDefault(); addProfession(p); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-left">
                    <span className="text-sm text-white font-medium">{p.name}</span>
                    {p.direction && <span className="text-xs text-slate-500 ml-auto flex-shrink-0">{p.direction.name}</span>}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && !profLoading && profResults.length === 0 && profSearch.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-500 z-50">
                Профессия не найдена
              </div>
            )}
          </div>

          {selectedProfs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedProfs.map(prof => (
                <div key={prof.professionId} className="flex items-center gap-1.5 bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-1.5">
                  <span className="text-sm text-white">{prof.professionName}</span>
                  {prof.directionName && <span className="text-xs text-slate-500">· {prof.directionName}</span>}
                  <button onClick={() => setSelectedProfs(p => p.filter(x => x.professionId !== prof.professionId))} className="text-slate-500 hover:text-red-400 transition-colors ml-0.5">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 bg-slate-800/30 border border-slate-700/30 rounded-xl px-4 py-3">
            Остальные профессии можно добавить в профиле (до 10). Фильтры также можно заполнить позже.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={saveProfessions}
            disabled={selectedProfs.length === 0 || loading}
            className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Сохранить
          </button>
          <button onClick={() => navigate('/')} className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Пропустить
          </button>
        </div>
      </div>
    </div>
  );
}
