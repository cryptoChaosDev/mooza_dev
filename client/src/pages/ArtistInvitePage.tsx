import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Link2, Share2, Tag, Loader2 } from 'lucide-react';
import { artistAPI } from '../lib/api';
import RolePicker from '../components/RolePicker';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

/**
 * Страница «Пригласить на сервис» — /artist/:id/invite.
 * Бывший нижний лист showInviteLink на ArtistPage: выбор ролей и статуса
 * участия → генерация бессрочной ссылки-приглашения для незарегистрированного
 * → поделиться/скопировать.
 */
export default function ArtistInvitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [participation, setParticipation] = useState<'ACTIVE_MEMBER' | 'FORMER_MEMBER'>('ACTIVE_MEMBER');
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const inviteLinkMut = useMutation({
    mutationFn: () =>
      artistAPI.createInviteLink(id!, { roleIds, participationStatus: participation }),
    onSuccess: (res: any) => { setGeneratedLink(res.data?.url ?? ''); setLinkCopied(false); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось создать ссылку')),
  });

  const shareLink = async () => {
    if (navigator.share) {
      try { await navigator.share({ url: generatedLink }); } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(generatedLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
      } catch { /* ignore */ }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Липкая шапка — как ArtistEditPage */}
      <div
        className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <Link2 size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Пригласить на сервис</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {!generatedLink ? (
          <>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Роли</p>
              <button
                onClick={() => setRolePickerOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
              >
                <span className={roleIds.length ? 'text-white' : 'text-slate-500'}>
                  {roleIds.length ? `Выбрано ролей: ${roleIds.length}` : 'Выбрать роли'}
                </span>
                <Tag size={14} className="text-slate-500" />
              </button>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Статус участия</p>
              <div className="flex gap-2">
                {([['ACTIVE_MEMBER', 'Действующий'], ['FORMER_MEMBER', 'Бывший']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setParticipation(val)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      participation === val
                        ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">Ссылка-приглашение готова. Она привязана к выбранным ролям и не имеет срока действия.</p>
            <div className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg">
              <code className="text-xs text-primary-300 truncate flex-1 min-w-0">{generatedLink}</code>
            </div>
          </>
        )}

        {/* Действия — липкий низ как ArtistEditPage */}
        <div
          className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 bg-slate-950/95 border-t border-slate-800/60 flex gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="flex-1 py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-2xl transition-colors"
          >
            {generatedLink ? 'Готово' : 'Отмена'}
          </button>
          {!generatedLink ? (
            <button
              onClick={() => inviteLinkMut.mutate()}
              disabled={inviteLinkMut.isPending}
              className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
            >
              {inviteLinkMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Создать ссылку
            </button>
          ) : (
            <button
              onClick={shareLink}
              className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Share2 size={14} /> {linkCopied ? 'Скопировано' : 'Поделиться'}
            </button>
          )}
        </div>
      </div>

      {/* RolePicker (сам лочит скролл и рисуется порталом) */}
      {rolePickerOpen && (
        <RolePicker
          context="collective"
          value={roleIds}
          onSave={(ids) => setRoleIds(ids)}
          onClose={() => setRolePickerOpen(false)}
          title="Роли приглашения"
        />
      )}
    </div>
  );
}
