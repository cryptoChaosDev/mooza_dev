import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Image, Smile, Send, X, Loader2,
  FileText, Briefcase, Calendar, CheckSquare, Lightbulb, Wrench, Plus, Zap, BarChart3,
  HelpCircle, ChevronDown, Hash, Music, Link2, MapPin, Search,
} from 'lucide-react';
import { postAPI, referenceAPI, userAPI } from '../lib/api';
import { yoIncludes } from '../lib/search';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';
import RichTextEditor from '../components/RichTextEditor';
import { type Editor } from '@tiptap/react';
import EmojiPicker from '../components/EmojiPicker';
import ServicePicker, { PickedService } from '../components/ServicePicker';
import CityPicker from '../components/CityPicker';

const POST_TYPES: Record<string, { label: string; icon: React.FC<any>; placeholder: string; inDev: boolean }> = {
  blog:       { label: 'Блог',              icon: FileText,    placeholder: 'Напишите что-нибудь...', inDev: false },
  vacancy:    { label: 'Вакансия',          icon: Briefcase,   placeholder: 'Опишите вакансию...',    inDev: true },
  event:      { label: 'Мероприятие',       icon: Calendar,    placeholder: 'Расскажите о событии...', inDev: true },
  task:       { label: 'Задача',            icon: CheckSquare, placeholder: 'Опишите задачу или проект...', inDev: true },
  offer:      { label: 'Предложение',       icon: Lightbulb,   placeholder: 'Что вы предлагаете?',   inDev: true },
  service:    { label: 'Услуга',            icon: Wrench,      placeholder: 'Опишите услугу...',      inDev: false },
  employment: { label: 'Апдейт занятости', icon: Zap,         placeholder: 'Расскажите об изменении статуса...', inDev: false },
  poll:       { label: 'Опрос',             icon: BarChart3,   placeholder: 'Контекст опроса (необязательно)...', inDev: false },
  question:   { label: 'Вопрос',            icon: HelpCircle,  placeholder: 'Опишите ваш вопрос подробнее...', inDev: false },
};

const FALLBACK_GENRES = [
  'Поп', 'Рок', 'Метал', 'Панк', 'Хип-Хоп', 'R&B', 'Соул', 'Фанк', 'Электронная музыка',
  'Джаз', 'Классическая музыка', 'Фолк', 'Этно', 'Шансон', 'Латино', 'Регги', 'Блюз',
  'Кантри', 'K-pop', 'J-pop', 'Инди', 'Open format', 'Любой жанр',
];

const QUESTION_CATEGORIES = [
  'Общее', 'Сотрудничество', 'Инструменты и софт', 'Юридическое', 'Карьера', 'Финансы', 'Другое',
];

const MAX_IMAGES = 10;

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'blog';
  // When composing FROM a specific offering (?type=service&serviceId=<UserService id>)
  // we show a structured form whose fields are auto-pulled from that service.
  const linkedServiceId = searchParams.get('serviceId') || '';
  const isStructuredService = type === 'service' && !!linkedServiceId;
  const meta = POST_TYPES[type] || POST_TYPES.blog;
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();

  const DRAFT_KEY = `mooza_draft_${type}`;

  const [content, setContent] = useState(() => localStorage.getItem(DRAFT_KEY) || '');
  const [images, setImages] = useState<{ url: string; serverUrl: string }[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickedServices, setPickedServices] = useState<PickedService[]>([]);
  const [showServicePicker, setShowServicePicker] = useState(false);
  // Structured «Услуга» — manually entered short description (max 200 chars).
  const [briefDescription, setBriefDescription] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDuration, setPollDuration] = useState('7');
  const [authorChoice, setAuthorChoice] = useState<{ type: 'user' | 'channel' | 'artist'; id: string; name: string; avatar?: string } | null>(null);

  // Question fields
  const [questionTitle, setQuestionTitle] = useState('');
  const [questionCategory, setQuestionCategory] = useState(QUESTION_CATEGORIES[0]);

  // Additional (optional) fields
  const [showExtra, setShowExtra] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [extraCity, setExtraCity] = useState('');
  const [linksInput, setLinksInput] = useState('');


  const { data: authorsData } = useQuery({
    queryKey: ['my-authors'],
    queryFn: async () => { const { data } = await postAPI.getMyAuthors(); return data; },
  });
  const { data: genresData } = useQuery({
    queryKey: ['ref-genres'],
    queryFn: async () => { const { data } = await referenceAPI.getGenres(); return data; },
  });

  // Structured «Услуга» — the offering this post advertises (auto-pulled fields).
  const { data: linkedService } = useQuery({
    queryKey: ['user-service', linkedServiceId],
    queryFn: async () => { const { data } = await userAPI.getUserService(linkedServiceId); return data as any; },
    enabled: isStructuredService,
  });
  // The reference Service carries the catalog section name (not on UserService).
  const refServiceId: string | undefined = linkedService?.service?.id;
  const { data: refServiceDetail } = useQuery({
    queryKey: ['ref-service-detail', refServiceId],
    queryFn: async () => { const { data } = await referenceAPI.getServiceDetail(refServiceId!); return data as any; },
    enabled: !!refServiceId,
  });
  // Catalog of genre names (server names if available, otherwise the static fallback)
  const genreCatalog: string[] = Array.isArray(genresData) && genresData.length > 0
    ? genresData.map((g: any) => (typeof g === 'string' ? g : g.name)).filter(Boolean)
    : FALLBACK_GENRES;

  const editorRef = useRef<Editor | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Autosave draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content) localStorage.setItem(DRAFT_KEY, content);
      else localStorage.removeItem(DRAFT_KEY);
    }, 800);
    return () => clearTimeout(timer);
  }, [content, DRAFT_KEY]);

  const insertEmoji = useCallback((emoji: string) => {
    const ed = editorRef.current;
    if (ed) { ed.chain().focus().insertContent(emoji).run(); return; }
    setContent(c => c + emoji);
  }, []);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    const toUpload = files.slice(0, Math.max(0, room));
    if (toUpload.length === 0) return;
    setUploading(true);
    try {
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await postAPI.uploadMedia(fd);
        setImages(prev => prev.length >= MAX_IMAGES ? prev : [...prev, { url: URL.createObjectURL(file), serverUrl: data.url }]);
      }
    } catch {
      alert('Не удалось загрузить файл. Проверьте формат и размер (до 20 МБ).');
    } finally {
      setUploading(false);
    }
  };

  // ── Tags ──────────────────────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const t = raw.replace(/^#+/, '').trim();
    if (!t) return;
    setTags(prev => prev.includes(t) ? prev : [...prev, t]);
  };
  const commitTagInput = () => {
    tagInput.split(/[\s,]+/).forEach(addTag);
    setTagInput('');
  };

  // ── Genres ────────────────────────────────────────────────────────────────
  const filteredGenres = genreCatalog.filter(g =>
    !genres.includes(g) && yoIncludes(g, genreSearch.trim())
  );
  const toggleGenre = (g: string) => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
    setGenreSearch('');
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
  // Freeform service picker only applies when NOT composing from a specific service.
  const isFreeformService = isService && !isStructuredService;
  const isEmployment = type === 'employment';
  const isPoll = type === 'poll';
  const isQuestion = type === 'question';
  const validPollOptions = pollOptions.filter(o => o.trim());
  const links = linksInput.split(/[\s\n]+/).map(s => s.trim()).filter(Boolean);
  const canPost = (
    isStructuredService
      ? !!linkedService
      : isQuestion
      ? (questionTitle.trim() && content.trim())
      : (
          content.trim() ||
          images.length > 0 ||
          (isFreeformService && pickedServices.length > 0) ||
          (isEmployment && !!employmentStatus) ||
          (isPoll && validPollOptions.length >= 2)
        )
  ) && !uploading;

  const handlePublish = () => {
    if (!canPost) return;
    const serverUrls = images.map(i => i.serverUrl);

    // Structured «Услуга» post — title is the service name, content is the short
    // description, and the post is linked to the offering via serviceId.
    if (isStructuredService) {
      createMut.mutate({
        content: briefDescription.trim(),
        type: 'service',
        serviceId: linkedServiceId,
        title: (linkedService?.name || linkedService?.service?.name || '').trim() || undefined,
        imageUrl: serverUrls[0] ?? undefined,
        images: serverUrls,
      });
      return;
    }

    let finalContent = content;
    if (isFreeformService && pickedServices.length > 0) {
      const serviceLines = pickedServices.map(s =>
        `🎸 ${s.serviceName} · ${s.sectionName}`
      ).join('\n');
      finalContent = serviceLines + (content.trim() ? '\n\n' + content : '');
    }
    createMut.mutate({
      content: finalContent,
      type,
      // Backward-compat single image + new multi-image array
      imageUrl: serverUrls[0] ?? undefined,
      images: serverUrls,
      channelId: authorChoice?.type === 'channel' ? authorChoice.id : null,
      artistId: authorChoice?.type === 'artist' ? authorChoice.id : null,
      ...(tags.length > 0 ? { tags } : {}),
      ...(genres.length > 0 ? { genres } : {}),
      ...(links.length > 0 ? { links } : {}),
      ...(extraCity ? { city: extraCity } : {}),
      ...(isQuestion ? { title: questionTitle.trim(), category: questionCategory } : {}),
      ...(isEmployment && employmentStatus ? { employmentStatus } : {}),
      ...(isPoll ? {
        pollOptions: validPollOptions,
        pollEndsAt: new Date(Date.now() + Number(pollDuration) * 24 * 60 * 60 * 1000).toISOString(),
      } : {}),
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
          <input ref={imageInputRef} type="file" accept="image/*,.gif" multiple className="hidden"
            onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) uploadFiles(fs); e.target.value = ''; }} />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading || images.length >= MAX_IMAGES}
            title={images.length >= MAX_IMAGES ? 'Максимум 10 фото' : 'Фото / GIF'}
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
                <p className="text-xs text-slate-500 truncate">
                  {isStructuredService
                    ? [currentUser.role, currentUser.city].filter(Boolean).join(' · ') || meta.label
                    : meta.label}
                </p>
              </div>
            </div>
          )}

          {/* Author selector — pick who publishes (user / channel / artist) */}
          {authorsData && (() => {
            const opts: Array<{type:'user'|'channel'|'artist'; id:string; name:string; avatar?:string}> = [
              { type: 'user', id: authorsData.user.id, name: `${authorsData.user.firstName} ${authorsData.user.lastName}`, avatar: authorsData.user.avatar },
              ...(authorsData.channel ? [{ type: 'channel' as const, id: authorsData.channel.id, name: authorsData.channel.name, avatar: authorsData.channel.avatar }] : []),
              ...(authorsData.artists ?? []).map((a: any) => ({ type: 'artist' as const, id: a.id, name: a.name, avatar: a.avatar })),
            ];
            const current = authorChoice ?? opts[0];

            // Employment can only be from user
            const employmentOnly = type === 'employment';
            const visibleOpts = employmentOnly ? opts.filter(o => o.type === 'user') : opts;

            if (visibleOpts.length <= 1) return null;
            return (
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">От имени</p>
                <div className="flex gap-2 flex-wrap">
                  {visibleOpts.map(opt => (
                    <button key={`${opt.type}-${opt.id}`} type="button"
                      onClick={() => setAuthorChoice(opt)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${current.id === opt.id ? 'bg-primary-600/20 border-primary-500/40 text-primary-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                      <span className="text-[10px] uppercase tracking-wide opacity-60">
                        {opt.type === 'user' ? '👤' : opt.type === 'channel' ? '📢' : '🎵'}
                      </span>
                      <span>{opt.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Question — title + category (type=question) */}
          {isQuestion && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Заголовок вопроса <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" maxLength={140}
                  value={questionTitle}
                  onChange={e => setQuestionTitle(e.target.value)}
                  placeholder="Коротко сформулируйте вопрос"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Категория</p>
                <div className="flex gap-2 flex-wrap">
                  {QUESTION_CATEGORIES.map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setQuestionCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        questionCategory === cat
                          ? 'bg-primary-600/20 border-primary-500/40 text-primary-300'
                          : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Structured «Услуга» — composing FROM a specific offering.
              All fields except краткое описание are auto-pulled from the service. */}
          {isStructuredService && (() => {
            const serviceTitle = linkedService?.name || linkedService?.service?.name || '';
            const sectionName =
              refServiceDetail?.sectionName || linkedService?.service?.section?.name || '';
            const price = linkedService && (linkedService.priceFrom != null || linkedService.priceTo != null)
              ? [
                  linkedService.priceFrom != null ? `от ${linkedService.priceFrom} ₽` : null,
                  linkedService.priceTo != null ? `до ${linkedService.priceTo} ₽` : null,
                ].filter(Boolean).join(' ')
              : 'По договорённости';
            return (
              <div className="mb-4 space-y-3">
                {!linkedService ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Type label */}
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-primary-500/10 text-primary-400 border-primary-500/20">
                      <Wrench size={11} /> Услуга
                    </span>

                    {/* Service title */}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Услуга</p>
                      <p className="text-base font-bold text-white">{serviceTitle || 'Без названия'}</p>
                    </div>

                    {/* Preview image — services have no image field; only show attached ones */}
                    {images.length > 0 && (
                      <img src={images[0].url} alt="Превью" className="w-full max-h-64 object-cover rounded-2xl border border-slate-800" />
                    )}

                    {/* Catalog section + price */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {sectionName && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Раздел каталога</p>
                          <p className="text-sm text-slate-200">{sectionName}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Стоимость</p>
                        <p className="text-sm text-primary-300 font-semibold">{price}</p>
                      </div>
                    </div>

                    {/* Краткое описание — manual, max 200 chars */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Краткое описание
                      </label>
                      <textarea
                        value={briefDescription}
                        onChange={e => setBriefDescription(e.target.value.slice(0, 200))}
                        maxLength={200}
                        placeholder="Коротко расскажите об услуге..."
                        rows={3}
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      />
                      <p className="text-[11px] text-slate-600 mt-1 text-right">{briefDescription.length} / 200</p>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Service selector — only for freeform type=service (no specific service) */}
          {isFreeformService && (
            <div className="mb-4">
              {/* Picked services */}
              {pickedServices.length > 0 && (
                <div className="space-y-2 mb-3">
                  {pickedServices.map((s, i) => (
                    <div key={s.serviceId} className="flex items-start gap-3 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{s.serviceName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {s.sectionName}
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

          {isPoll && (
            <div className="mb-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Варианты ответа</p>
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text" maxLength={80}
                      placeholder={`Вариант ${idx + 1}`}
                      value={opt}
                      onChange={e => setPollOptions(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                      className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 10 && (
                  <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])}
                    className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                    <Plus size={12} />Добавить вариант
                  </button>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Длительность опроса</p>
                <div className="flex gap-2 flex-wrap">
                  {['1', '3', '7', '14', '30'].map(d => (
                    <button key={d} type="button"
                      onClick={() => setPollDuration(d)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${pollDuration === d ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                      {d} {d === '1' ? 'день' : (['3','4'].includes(d) ? 'дня' : 'дней')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isStructuredService && (
            <RichTextEditor
              value={content}
              onChange={setContent}
              onReady={(e) => { editorRef.current = e; }}
              autoFocus
              minHeight={isFreeformService && pickedServices.length > 0 ? 80 : 140}
              placeholder={
                isQuestion ? 'Опишите ваш вопрос подробнее...'
                : isFreeformService && pickedServices.length > 0 ? 'Опишите подробнее — цены, условия, опыт...'
                : meta.placeholder
              }
            />
          )}

          {/* Image thumbnails (multi, up to 10) */}
          {images.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={img.url} alt={`photo ${i + 1}`} className="h-24 w-24 rounded-xl object-cover border border-slate-700" />
                  <button
                    type="button"
                    onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {images.length > 0 && (
            <p className="text-[11px] text-slate-600 mt-1">{images.length} / {MAX_IMAGES} фото</p>
          )}

          {/* ── Дополнительно (optional secondary fields) — hidden for structured «Услуга» ── */}
          {!isStructuredService && (
          <div className="mt-5 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setShowExtra(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <ChevronDown size={14} className={`transition-transform ${showExtra ? 'rotate-180' : ''}`} />
              Дополнительно
              {(tags.length + genres.length + links.length + (extraCity ? 1 : 0)) > 0 && (
                <span className="ml-1 bg-primary-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none">
                  {tags.length + genres.length + links.length + (extraCity ? 1 : 0)}
                </span>
              )}
            </button>

            {showExtra && (
              <div className="mt-4 space-y-5">
                {/* Tags */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    <Hash size={13} /> Теги
                  </label>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-600/15 border border-primary-500/30 text-primary-300 rounded-lg text-xs">
                          #{t}
                          <button type="button" onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:text-white">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTagInput(); } }}
                    onBlur={commitTagInput}
                    placeholder="Введите тег и нажмите Enter"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                {/* Genres */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    <Music size={13} /> Жанры
                  </label>
                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {genres.map(g => (
                        <span key={g} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-600/15 border border-primary-500/30 text-primary-300 rounded-lg text-xs">
                          {g}
                          <button type="button" onClick={() => toggleGenre(g)} className="hover:text-white">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:ring-1 focus-within:ring-primary-500">
                      <Search size={14} className="text-slate-500 flex-shrink-0" />
                      <input
                        type="text"
                        value={genreSearch}
                        onChange={e => setGenreSearch(e.target.value)}
                        placeholder="Поиск жанра..."
                        className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                    {genreSearch.trim() && filteredGenres.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-40 max-h-52 overflow-y-auto">
                        {filteredGenres.map(g => (
                          <button key={g} type="button"
                            onMouseDown={e => { e.preventDefault(); toggleGenre(g); }}
                            className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700/50 transition-colors">
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* City */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    <MapPin size={13} /> Город
                  </label>
                  <CityPicker city={extraCity} country="" onChange={(c) => setExtraCity(c)} />
                </div>

                {/* Links */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    <Link2 size={13} /> Ссылки
                  </label>
                  <textarea
                    value={linksInput}
                    onChange={e => setLinksInput(e.target.value)}
                    placeholder="Каждая ссылка с новой строки или через пробел"
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                  {links.length > 0 && (
                    <p className="text-[11px] text-slate-600 mt-1">{links.length} ссыл.</p>
                  )}
                </div>
              </div>
            )}
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
