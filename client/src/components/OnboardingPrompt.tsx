import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, BookOpen } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const DISMISSED_KEY = 'mooza_onboarding_prompt_dismissed';

function isOnboardingDone(user: any): boolean {
  return !!(user?.onboardingCompletedAt || localStorage.getItem('mooza_tour_done'));
}

export default function OnboardingPrompt() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [dismissed, setDismissed] = useState(
    () => !!sessionStorage.getItem(DISMISSED_KEY),
  );
  const [showHint, setShowHint] = useState(false);

  // Don't show if onboarding already done or dismissed this session
  if (isOnboardingDone(user) || dismissed) return null;

  const handleYes = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, '1');
    navigate('/onboarding');
  };

  const handleNo = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setShowHint(true);
  };

  if (showHint) {
    return (
      <div className="mx-4 mt-3 flex items-start gap-3 px-4 py-3 bg-slate-800/60 border border-slate-700/50 rounded-2xl text-sm text-slate-400">
        <BookOpen size={16} className="text-primary-400 flex-shrink-0 mt-0.5" />
        <span>
          Онбординг можно пройти позже —{' '}
          <span className="text-slate-300">нажми <span className="text-primary-400">ⓘ</span> в шапке → «Начать онбординг заново»</span>
        </span>
        <button onClick={() => setShowHint(false)} className="ml-auto text-slate-600 hover:text-slate-400 flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 bg-primary-600/10 border border-primary-500/30 rounded-2xl">
      <Sparkles size={18} className="text-primary-400 flex-shrink-0" />
      <p className="text-sm text-slate-200 flex-1">Пройти онбординг и узнать, как работает платформа?</p>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={handleYes}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold rounded-xl transition-colors"
        >
          Да
        </button>
        <button
          onClick={handleNo}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-medium rounded-xl transition-colors"
        >
          Позже
        </button>
      </div>
    </div>
  );
}
