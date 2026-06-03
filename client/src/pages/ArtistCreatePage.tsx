import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Camera, Copy, Check, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { artistAPI, referenceAPI, roleAPI } from '../lib/api';
import { avatarUrl } from '../lib/avatar';
import SelectSheet from '../components/SelectSheet';
import ImageCropModal, { blobToFile } from '../components/ImageCropModal';
import { SocialLinksEditor, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import CityPicker from '../components/CityPicker';
import RolePicker from '../components/RolePicker';

const TYPE_OPTIONS = [
  { id: 'SOLO',        name: 'Сольный артист' },
  { id: 'DUET',        name: 'Дуэт' },
  { id: 'GROUP',       name: 'Группа' },
  { id: 'COVER_GROUP', name: 'Кавер-группа' },
  { id: 'TRIBUTE',     name: 'Трибьют' },
  { id: 'CHOIR',       name: 'Хор' },
  { id: 'ENSEMBLE',    name: 'Ансамбль' },
  { id: 'ORCHESTRA',   name: 'Оркестр' },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map(t => [t.id, t.name]));

const INSTRUCTION =
  'Для размещения артиста в каталоге необходимо пройти верификацию. Вы получите уникальный код, который нужно разместить в посте или описании профиля артиста в соцсетях и прислать нам ссылку на этот профиль. Саппорт проверит код и опубликует карточку.';

type Form = {
  name: string;
  type: string;
  city: string;
  genreIds: string[];
  submitterRoleIds: string[];
  socialLinks: Record<string, string>;
};

export default function ArtistCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>({ name: '', type: '', city: '', genreIds: [], submitterRoleIds: [], socialLinks: {} });
  const [genreSheetOpen, setGenreSheetOpen] = useState(false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  // Avatar + banner (uploaded after the artist is created)
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropAvatarFile, setCropAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [cropBannerFile, setCropBannerFile] = useState<File | null>(null);

  // Duplicate check
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; avatar: string | null; type: string | null; verified: boolean } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Post-create state
  const [created, setCreated] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (key: keyof Form, value: any) => setForm(f => ({ ...f, [key]: value }));

  const { data: genreOptions = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => { const { data } = await referenceAPI.getGenres(); return data as { id: string; name: string }[]; },
  });

  // Submitter role is picked from the seeded role catalog (collective context).
  const { data: collectiveRoles = [] } = useQuery({
    queryKey: ['roles', 'collective'],
    queryFn: async () => {
      const { data } = await roleAPI.list('collective');
      return (data as { category: string; roles: { id: string; name: string }[] }[]).flatMap(c => c.roles);
    },
  });
  const roleNameById = new Map(collectiveRoles.map(r => [r.id, r.name]));
  const selectedRoleNames = form.submitterRoleIds.map(id => roleNameById.get(id)).filter(Boolean) as string[];


  // Debounced duplicate check while typing the name.
  const handleNameChange = (value: string) => {
    set('name', value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setDuplicate(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await artistAPI.checkName(value.trim());
        setDuplicate(data?.exists ? data.artist : null);
      } catch { setDuplicate(null); }
    }, 350);
  };

  const onAvatarPick = (file: File) => {
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };
  const onBannerPick = (file: File) => {
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);

  // Step 1: create artist + receive verification code, then upload avatar.
  const createMut = useMutation({
    mutationFn: async () => {
      const { data } = await artistAPI.createArtist({
        name: form.name.trim(),
        type: form.type || undefined,
        city: form.city.trim() || undefined,
        genreIds: form.genreIds,
        submitterRoles: form.submitterRoleIds.map(id => roleNameById.get(id)).filter(Boolean),
        socialLinks: Object.keys(form.socialLinks).length ? form.socialLinks : undefined,
      });
      if (avatarFile) {
        try {
          const up = await artistAPI.uploadAvatar(data.id, avatarFile);
          data.avatar = up.data?.avatar ?? data.avatar;
        } catch { /* non-fatal; user can retry on the artist page */ }
      }
      if (bannerFile) {
        try { await artistAPI.uploadBanner(data.id, bannerFile); }
        catch { /* non-fatal; user can retry on the artist page */ }
      }
      return data;
    },
    onSuccess: (data) => setCreated(data),
  });

  const copyCode = () => {
    if (!created?.verificationCode) return;
    navigator.clipboard.writeText(created.verificationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Required card fields: name, type, avatar.
  const canCreate = !!form.name.trim() && !!form.type && !!avatarFile && !createMut.isPending;

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <span className="font-semibold text-white text-sm">Новый артист</span>
          <span className="w-8" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-xl mx-auto">
        {/* Instruction banner */}
        <div className="p-3 rounded-xl bg-primary-500/10 border border-primary-500/20">
          <p className="text-xs text-primary-200 leading-relaxed flex gap-2">
            <ShieldCheck size={16} className="flex-shrink-0 mt-0.5 text-primary-400" />
            <span>{INSTRUCTION}</span>
          </p>
        </div>

        {!created ? (
          <>
            {/* Submitter role — picked from the role catalog */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Кем вы являетесь для артиста</label>
              {selectedRoleNames.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedRoleNames.map(n => (
                    <span key={n} className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary-600/20 border border-primary-500/30 text-primary-200">{n}</span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setRolePickerOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-left flex justify-between items-center transition-colors hover:border-slate-600"
              >
                <span className={selectedRoleNames.length ? 'text-white' : 'text-slate-500'}>
                  {selectedRoleNames.length ? `Выбрано ролей: ${selectedRoleNames.length}` : 'Выбрать роль из каталога'}
                </span>
                <span className="text-slate-500 text-xs">▾</span>
              </button>
            </div>

            {/* Banner */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Обложка</label>
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="relative w-full h-28 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center hover:border-slate-600 transition-colors"
              >
                {bannerPreview
                  ? <img src={bannerPreview} alt="" className="w-full h-full object-cover" />
                  : <span className="flex items-center gap-2 text-slate-500 text-sm"><ImageIcon size={20} /> Добавить обложку</span>}
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setCropBannerFile(f); e.target.value = ''; }}
              />
            </div>

            {/* Avatar */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Аватар <span className="text-red-400">*</span></label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center hover:border-slate-600 transition-colors"
                >
                  {avatarPreview
                    ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                    : <Camera size={22} className="text-slate-500" />}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setCropAvatarFile(f); e.target.value = ''; }}
                />
                <p className="text-xs text-slate-500">Загрузите логотип или фото артиста</p>
              </div>
            </div>

            {/* Название */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Название *</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Название артиста"
                autoComplete="off"
              />
              {duplicate && (
                <div className="mt-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xs text-amber-300 font-medium mb-2">Такой артист уже существует</p>
                  <div className="flex items-center gap-3 mb-2">
                    {duplicate.avatar
                      ? <img src={avatarUrl(duplicate.avatar) ?? undefined} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      : <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center text-slate-400 text-sm">{duplicate.name[0]?.toUpperCase()}</div>}
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{duplicate.name}</p>
                      {duplicate.type && TYPE_LABELS[duplicate.type] && (
                        <p className="text-xs text-slate-400">{TYPE_LABELS[duplicate.type]}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">
                    Если это ваш артист, вы можете запросить роль на его странице или написать в поддержку.
                  </p>
                  <a
                    href="mailto:support@moooza.ru"
                    className="text-xs text-primary-400 hover:underline"
                  >
                    Написать в поддержку
                  </a>
                </div>
              )}
            </div>

            {/* Тип артиста */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Тип артиста <span className="text-red-400">*</span></label>
              <button
                type="button"
                onClick={() => setTypeSheetOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-left flex justify-between items-center transition-colors hover:border-slate-600"
              >
                <span className={form.type ? 'text-white' : 'text-slate-500'}>
                  {form.type ? TYPE_LABELS[form.type] : 'Выбрать тип'}
                </span>
                <span className="text-slate-500 text-xs">▾</span>
              </button>
            </div>

            {/* Жанры */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Жанры</label>
              <button
                type="button"
                onClick={() => setGenreSheetOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-left flex justify-between items-center transition-colors hover:border-slate-600"
              >
                <span className={form.genreIds.length ? 'text-white' : 'text-slate-500'}>
                  {form.genreIds.length
                    ? genreOptions.filter(g => form.genreIds.includes(g.id)).map(g => g.name).join(', ')
                    : 'Выбрать жанры'}
                </span>
                <span className="text-slate-500 text-xs">▾</span>
              </button>
            </div>

            {/* Локация — автокомплит реальных городов (выбор из списка) */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Локация</label>
              <CityPicker city={form.city} country="" onChange={(c) => set('city', c)} />
            </div>

            {/* Контакты */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Контакты</label>
              <SocialLinksEditor
                value={form.socialLinks}
                onChange={v => set('socialLinks', v)}
                only={CONTACT_KEYS}
              />
            </div>

            {/* Соцсети */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Соцсети</label>
              <SocialLinksEditor
                value={form.socialLinks}
                onChange={v => set('socialLinks', v)}
                only={SOCIAL_KEYS}
              />
            </div>

            {/* Get code */}
            <button
              onClick={() => createMut.mutate()}
              disabled={!canCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Получить код
            </button>

            {createMut.isError && (
              <p className="text-xs text-red-400 text-center">Ошибка при создании. Попробуйте ещё раз.</p>
            )}
          </>
        ) : (
          <>
            {/* Verification code */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700">
              <p className="text-sm text-white font-medium mb-1">Артист создан</p>
              <p className="text-xs text-slate-400 mb-3">
                Разместите этот код в посте или описании профиля артиста в соцсетях:
              </p>
              <div className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg">
                <code className="text-base font-mono font-bold text-primary-400 tracking-wider flex-1">
                  {created.verificationCode}
                </code>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1 text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded transition-colors"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-primary-500/5 border border-primary-500/20">
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Дальше — на странице артиста: добавьте участников (минимум по типу артиста),
                разместите код в профиле артиста в соцсетях и отправьте заявку на верификацию.
              </p>
              <button
                onClick={() => navigate(`/artist/${created.id}`, { replace: true })}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
              >
                <ShieldCheck size={16} /> Перейти на страницу артиста
              </button>
            </div>
          </>
        )}
      </div>

      {cropAvatarFile && (
        <ImageCropModal
          file={cropAvatarFile}
          aspect={1}
          cropShape="round"
          title="Аватар"
          onCancel={() => setCropAvatarFile(null)}
          onCropped={blob => { onAvatarPick(blobToFile(blob, 'avatar.jpg')); setCropAvatarFile(null); }}
        />
      )}

      {cropBannerFile && (
        <ImageCropModal
          file={cropBannerFile}
          aspect={3}
          cropShape="rect"
          title="Обложка"
          onCancel={() => setCropBannerFile(null)}
          onCropped={blob => { onBannerPick(blobToFile(blob, 'banner.jpg')); setCropBannerFile(null); }}
        />
      )}

      {rolePickerOpen && (
        <RolePicker
          context="collective"
          value={form.submitterRoleIds}
          onSave={(ids) => set('submitterRoleIds', ids)}
          onClose={() => setRolePickerOpen(false)}
          title="Ваша роль"
        />
      )}


      <SelectSheet
        isOpen={typeSheetOpen}
        onClose={() => setTypeSheetOpen(false)}
        title="Тип артиста"
        options={TYPE_OPTIONS}
        selectedIds={form.type}
        onSelect={v => { set('type', v as string); setTypeSheetOpen(false); }}
        mode="single"
        searchable={false}
        height="auto"
      />

      <SelectSheet
        isOpen={genreSheetOpen}
        onClose={() => setGenreSheetOpen(false)}
        title="Жанры"
        options={genreOptions}
        selectedIds={form.genreIds}
        onSelect={v => set('genreIds', v as string[])}
        mode="multiple"
        showConfirm
        height="full"
      />
    </div>
  );
}
