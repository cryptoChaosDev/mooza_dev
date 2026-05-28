import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Image, Smile, Send, X, Loader2,
  FileText, Briefcase, Calendar, CheckSquare, Lightbulb, Wrench, Plus, Zap,
} from 'lucide-react';
import { postAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';
import EmojiPicker from '../components/EmojiPicker';
import ServicePicker, { PickedService } from '../components/ServicePicker';

const POST_TYPES: Record<string, { label: string; icon: React.FC<any>; placeholder: string; inDev: boolean }> = {
  blog:       { label: 'Блог',              icon: FileText,    placeholder: 'Напишите что-нибудь...', inDev: false },
  vacancy:    { label: 'Вакансия',          icon: Briefcase,   placeholder: 'Опишите вакансию...',    inDev: true },
  event:      { label: 'Мероприятие',       icon: Calendar,    placeholder: 'Расскажите о событии...', inDev: true },
  task:       { label: 'Задача',            icon: CheckSquare, placeholder: 'Опишите задачу или проект...', inDev: true },
  offer:      { label: 'Предложение',       icon: Lightbulb,   placeholder: 'Что вы предлагаете?',   inDev: true },
  service:    { label: 'Услуга',            icon: Wrench,      placeholder: 'Опишите услугу...',      inDev: false },
  employment: { label: 'Апдейт занятости', icon: Zap,         placeholder: 'Расскажите об изменении статуса...', inDev: false },
};

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'blog';
  const meta = POST_TYPES[type] || POST_TYPES.blog;
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();

  const DRAFT_KEY = `mooza_draft_${type}`;

  const [content, setContent] = useState(() => localStorage.getItem(DRAFT_KEY) || '');
  const [imagePreview, setImagePreview] = useState<{ url: string; serverUrl: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickedServices, setPickedServices] = useState<PickedService[]>([]);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Autosave draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content) localStorage.setItem(DRAFT_KEY, content);
      else localStorage.removeItem(DRAFT_KEY);
    }, 800);
    return () => clearTimeout(timer);
  }, [content, DRAFT_KEY]);

  // Auto-resize textarea
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
      autoResize();
    }, 100);
  }, []);

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (!el) { setContent(c => c + emoji); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setContent(c => c.slice(0, start) + emoji + c.slice(end));
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length;
      el.focus();
      autoResize();
    }, 0);
  }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await postAPI.uploadMedia(fd);
      setImagePreview({ url: URL.createObjectURL(file), serverUrl: data.url });
    } catch {
      alert('Не удалось загрузить файл. Проверьте формат и размер (до 20 МБ).');
    } finally {
      setUploading(false);
    }
  };

  const createMut = useMutation({
    mutationFn: postAPI.createPost,
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      navigate('/');
    },
  });

  const isService = type === 'service';
  const isEmployment = type === 'employment';
  const canPost = (content.trim() || imagePreview || (isService && pickedServices.length > 0) || (isEmployment && !!employmentStatus)) && !uploading;

  const handlePublish = () => {
    if (!canPost) return;
    let finalContent = content;
    if (isService && pickedServices.length > 0) {
      const serviceLines = pickedServices.map(s =>
        `🎸 ${s.serviceName} · ${s.professionName} · ${s.directionName}`
      ).join('\n');
      finalContent = serviceLines + (content.trim() ? '\n\n' + content : '');
    }
    createMut.mutate({
      content: finalContent,
      type,
      imageUrl: imagePreview?.serverUrl,
      ...(isEmployment && employmentStatus ? { employmentStatus } : {}),
    });
  };

  const handleCancel = () => {
    navigate('/');
  };

  const TypeIcon = meta.icon;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="max-w-2xl w-full mx-auto flex flex-col flex-1">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-2">
          <button
            onClick={handleCancel}
            className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <TypeIcon size={16} className="text-primary-400 flex-shrink-0" />
            <h2 className="text-sm font-bold text-white truncate">{meta.label}</h2>
          </div>

          {/* Attachment buttons — always visible, not affected by keyboard */}
          <input ref={imageInputRef} type="file" accept="image/*,.gif" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading || !!imagePreview}
            title="Фото / GIF"
            className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Image size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setShowEmoji(e => !e)}
            title="Эмодзи"
            className={`p-2 rounded-xl transition-colors flex-shrink-0 ${showEmoji ? 'text-primary-400 bg-slate-800' : 'text-slate-400 hover:text-primary-400 hover:bg-slate-800'}`}
          >
            <Smile size={18} />
          </button>

          <button
            onClick={handlePublish}
            disabled={!canPost || createMut.isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span className="hidden sm:inline">Опубликовать</span>
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 px-4 pt-4">
          {currentUser && (
            <div className="flex gap-3 mb-3">
              <AvatarComponent
                src={currentUser.avatar}
                name={`${currentUser.firstName} ${currentUser.lastName}`}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{currentUser.firstName} {currentUser.lastName}</p>
                <p className="text-xs text-slate-500">{meta.label}</p>
              </div>
            </div>
          )}

          {/* Service selector — only for type=service */}
          {isService && (
            <div className="mb-4">
              {/* Picked services */}
              {pickedServices.length > 0 && (
                <div className="space-y-2 mb-3">
                  {pickedServices.map((s, i) => (
                    <div key={s.serviceId} className="flex items-start gap-3 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{s.serviceName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {s.professionName} · {s.directionName} · {s.fieldName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickedServices(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add service button */}
              <button
                type="button"
                onClick={() => setShowServicePicker(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700 hover:border-primary-500/50 hover:bg-primary-500/5 rounded-2xl text-slate-400 hover:text-primary-400 text-sm font-medium transition-all"
              >
                <Plus size={16} />
                {pickedServices.length === 0 ? 'Выбрать услугу из справочника' : 'Добавить ещё услугу'}
              </button>

              {pickedServices.length > 0 && (
                <div className="mt-3 border-t border-slate-800 pt-3">
                  <p className="text-xs text-slate-500 mb-2">Дополнительное описание (необязательно)</p>
                </div>
              )}
            </div>
          )}

          {/* Employment status selector — only for type=employment */}
          {isEmployment && (
            <div className="mb-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Новый статус занятости</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'open', label: '🟢 Открыт для работы' },
                  { value: 'considering', label: '🟡 Рассматриваю' },
                  { value: 'closed', label: '🔴 Закрыт' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setEmploymentStatus(opt.value)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                      employmentStatus === opt.value
                        ? 'bg-primary-600/20 border-primary-500/40 text-primary-300'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600">При публикации статус в профиле обновится автоматически.</p>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => { setContent(e.target.value); autoResize(); }}
            placeholder={isService && pickedServices.length > 0 ? 'Опишите подробнее — цены, условия, опыт...' : meta.placeholder}
            className="w-full bg-transparent text-base text-white placeholder-slate-500 focus:outline-none resize-none min-h-[100px] leading-relaxed"
            rows={isService && pickedServices.length > 0 ? 3 : 6}
          />

          {/* Image preview */}
          {imagePreview && (
            <div className="relative mt-3 inline-block">
              <img src={imagePreview.url} alt="preview" className="max-h-72 rounded-2xl object-cover border border-slate-700" />
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

        </div>

        {/* Emoji picker (portal, opened from header) */}
        {showEmoji && (
          <div className="relative">
            <EmojiPicker
              onSelect={emoji => insertEmoji(emoji)}
              onClose={() => setShowEmoji(false)}
            />
          </div>
        )}
      </div>

      {showServicePicker && (
        <ServicePicker
          onSelect={s => { setPickedServices(prev => [...prev, s]); setShowServicePicker(false); }}
          onClose={() => setShowServicePicker(false)}
          excludeServiceIds={pickedServices.map(s => s.serviceId)}
        />
      )}
    </div>
  );
}
