import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileText, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export default function ConsentModal() {
  const [checked, setChecked] = useState(false);
  const { setUser } = useAuthStore();

  const agreeMut = useMutation({
    mutationFn: () => userAPI.agreeToTerms(),
    onSuccess: (res) => {
      setUser(res.data);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} className="text-primary-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg leading-tight">Соглашения платформы</h2>
            <p className="text-slate-400 text-xs mt-0.5">Необходимо для продолжения работы</p>
          </div>
        </div>

        <p className="text-slate-300 text-sm mb-5">
          Перед использованием Moooza ознакомьтесь с документами и подтвердите своё согласие:
        </p>

        {/* Documents */}
        <div className="space-y-2 mb-6">
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-slate-800 hover:bg-slate-800/80 border border-slate-700 rounded-xl transition-colors group"
          >
            <FileText size={16} className="text-primary-400 flex-shrink-0" />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex-1">Пользовательское соглашение</span>
            <span className="text-xs text-slate-500">↗</span>
          </a>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-slate-800 hover:bg-slate-800/80 border border-slate-700 rounded-xl transition-colors group"
          >
            <ShieldCheck size={16} className="text-primary-400 flex-shrink-0" />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex-1">Политика обработки персональных данных</span>
            <span className="text-xs text-slate-500">↗</span>
          </a>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-6 group">
          <div className="relative flex-shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
              checked ? 'bg-primary-500 border-primary-500' : 'border-slate-600 bg-slate-800 group-hover:border-slate-500'
            }`}>
              {checked && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-slate-400 leading-snug">
            Я прочитал(а) и принимаю{' '}
            <a href="/terms" target="_blank" className="text-primary-400 hover:text-primary-300 underline underline-offset-2">Пользовательское соглашение</a>
            {' '}и{' '}
            <a href="/privacy" target="_blank" className="text-primary-400 hover:text-primary-300 underline underline-offset-2">Политику конфиденциальности</a>
          </span>
        </label>

        {/* Button */}
        <button
          disabled={!checked || agreeMut.isPending}
          onClick={() => agreeMut.mutate()}
          className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all
            bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {agreeMut.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Сохраняем...
            </>
          ) : (
            'Принять и продолжить'
          )}
        </button>

        {agreeMut.isError && (
          <p className="text-red-400 text-xs text-center mt-3">Произошла ошибка. Попробуйте ещё раз.</p>
        )}
      </div>
    </div>
  );
}
