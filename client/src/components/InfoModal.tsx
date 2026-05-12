import { createPortal } from 'react-dom';
import { X, Mail, FileText, Shield, MessageCircle, Music2 } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function InfoModal({ onClose }: Props) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[61] bg-slate-900 border-t border-slate-800 rounded-t-3xl pb-safe" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-4" />

        <div className="flex items-center justify-between px-5 mb-5">
          <div className="flex items-center gap-2.5">
            <Music2 size={20} className="text-primary-400" />
            <h2 className="text-base font-bold text-white">О Moooza</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="px-5 space-y-3 pb-4">
          {/* Version */}
          <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5">
            <span className="text-sm text-slate-300">Версия</span>
            <span className="text-sm text-slate-500">1.0</span>
          </div>

          {/* Links */}
          {[
            { icon: FileText, label: 'Пользовательское соглашение', href: '/terms' },
            { icon: Shield,   label: 'Политика конфиденциальности', href: '/privacy' },
          ].map(({ icon: Icon, label, href }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 hover:bg-slate-800 transition-colors"
            >
              <Icon size={17} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-300 flex-1">{label}</span>
            </a>
          ))}

          {/* Support */}
          <a
            href="mailto:support@moooza.ru"
            className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 hover:bg-slate-800 transition-colors"
          >
            <Mail size={17} className="text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300">Служба поддержки</p>
              <p className="text-xs text-slate-500">support@moooza.ru</p>
            </div>
          </a>

          {/* Feedback */}
          <a
            href="https://t.me/moooza_support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 hover:bg-slate-800 transition-colors"
          >
            <MessageCircle size={17} className="text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300">Написать в поддержку</p>
              <p className="text-xs text-slate-500">Telegram</p>
            </div>
          </a>

          <p className="text-center text-xs text-slate-600 pt-1">
            © {new Date().getFullYear()} Moooza — Социальная сеть для музыкантов
          </p>
        </div>
      </div>
    </>,
    document.body
  );
}
