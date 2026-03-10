import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../lib/api';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Item { id: string; name: string; [key: string]: any }

// ─── Simple name-only CRUD table ────────────────────────────────────────────

function SimpleTable({
  title,
  queryKey,
  apiModule,
  extraFields,
}: {
  title: string;
  queryKey: string;
  apiModule: { list: () => any; create: (d: any) => any; update: (id: string, d: any) => any; remove: (id: string) => any };
  extraFields?: { key: string; label: string; placeholder?: string }[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: [queryKey],
    queryFn: () => apiModule.list().then((r: any) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const createMut = useMutation({
    mutationFn: (data: any) => apiModule.create(data),
    onSuccess: () => { invalidate(); setAdding(false); setForm({}); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiModule.update(id, data),
    onSuccess: () => { invalidate(); setEditId(null); setForm({}); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiModule.remove(id),
    onSuccess: invalidate,
  });

  const startEdit = (item: Item) => {
    setEditId(item.id);
    const f: Record<string, string> = { name: item.name };
    extraFields?.forEach(ef => { f[ef.key] = item[ef.key] ?? ''; });
    setForm(f);
  };

  const confirmSave = (id: string) => {
    updateMut.mutate({ id, data: form });
  };

  const confirmAdd = () => {
    createMut.mutate(form);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="font-semibold text-white">{title}</h3>
        <button
          onClick={() => { setAdding(true); setForm({}); }}
          className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> Добавить
        </button>
      </div>

      <div className="divide-y divide-slate-800">
        {adding && (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50">
            <input
              autoFocus
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Название"
              className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
            />
            {extraFields?.map(ef => (
              <input
                key={ef.key}
                value={form[ef.key] ?? ''}
                onChange={e => setForm(f => ({ ...f, [ef.key]: e.target.value }))}
                placeholder={ef.placeholder ?? ef.label}
                className="w-28 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
              />
            ))}
            <button onClick={confirmAdd} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
            <button onClick={() => { setAdding(false); setForm({}); }} className="text-slate-400 hover:text-white"><X size={16} /></button>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800/30 group">
            {editId === item.id ? (
              <>
                <input
                  autoFocus
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
                />
                {extraFields?.map(ef => (
                  <input
                    key={ef.key}
                    value={form[ef.key] ?? ''}
                    onChange={e => setForm(f => ({ ...f, [ef.key]: e.target.value }))}
                    placeholder={ef.placeholder ?? ef.label}
                    className="w-28 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
                  />
                ))}
                <button onClick={() => confirmSave(item.id)} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
                <button onClick={() => { setEditId(null); setForm({}); }} className="text-slate-400 hover:text-white"><X size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-200">{item.name}</span>
                {extraFields?.map(ef => (
                  <span key={ef.key} className="text-xs text-slate-500 w-28 truncate">{item[ef.key] ?? '—'}</span>
                ))}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
                  <button onClick={() => deleteMut.mutate(item.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}

        {items.length === 0 && !adding && (
          <div className="px-4 py-4 text-sm text-slate-500 text-center">Нет записей</div>
        )}
      </div>
    </div>
  );
}

// ─── Profession table (needs fieldOfActivity select) ─────────────────────────

function ProfessionTable() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; fieldOfActivityId: string }>({ name: '', fieldOfActivityId: '' });

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ['admin-professions'],
    queryFn: () => adminAPI.professions.list().then((r: any) => r.data),
  });
  const { data: fields = [] } = useQuery<Item[]>({
    queryKey: ['admin-fields-of-activity'],
    queryFn: () => adminAPI.fieldsOfActivity.list().then((r: any) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-professions'] });

  const createMut = useMutation({ mutationFn: (d: any) => adminAPI.professions.create(d), onSuccess: () => { invalidate(); setAdding(false); setForm({ name: '', fieldOfActivityId: '' }); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => adminAPI.professions.update(id, data), onSuccess: () => { invalidate(); setEditId(null); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => adminAPI.professions.remove(id), onSuccess: invalidate });

  const startEdit = (item: Item) => {
    setEditId(item.id);
    setForm({ name: item.name, fieldOfActivityId: item.fieldOfActivity?.id ?? '' });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="font-semibold text-white">Профессии</h3>
        <button onClick={() => { setAdding(true); setForm({ name: '', fieldOfActivityId: '' }); }} className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={14} /> Добавить
        </button>
      </div>
      <div className="divide-y divide-slate-800">
        {adding && (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50">
            <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Название" className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500" />
            <select value={form.fieldOfActivityId} onChange={e => setForm(f => ({ ...f, fieldOfActivityId: e.target.value }))} className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:border-primary-500 outline-none">
              <option value="">— Область —</option>
              {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button onClick={() => createMut.mutate(form)} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
            <button onClick={() => { setAdding(false); }} className="text-slate-400 hover:text-white"><X size={16} /></button>
          </div>
        )}
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800/30 group">
            {editId === item.id ? (
              <>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500" />
                <select value={form.fieldOfActivityId} onChange={e => setForm(f => ({ ...f, fieldOfActivityId: e.target.value }))} className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:border-primary-500 outline-none">
                  <option value="">— Область —</option>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button onClick={() => updateMut.mutate({ id: item.id, data: form })} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
                <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-200">{item.name}</span>
                <span className="text-xs text-slate-500">{item.fieldOfActivity?.name ?? '—'}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
                  <button onClick={() => deleteMut.mutate(item.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && !adding && <div className="px-4 py-4 text-sm text-slate-500 text-center">Нет записей</div>}
      </div>
    </div>
  );
}

// ─── Service table (needs profession select) ──────────────────────────────────

function ServiceTable() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; professionId: string }>({ name: '', professionId: '' });

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ['admin-services'],
    queryFn: () => adminAPI.services.list().then((r: any) => r.data),
  });
  const { data: professions = [] } = useQuery<Item[]>({
    queryKey: ['admin-professions'],
    queryFn: () => adminAPI.professions.list().then((r: any) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-services'] });

  const createMut = useMutation({ mutationFn: (d: any) => adminAPI.services.create(d), onSuccess: () => { invalidate(); setAdding(false); setForm({ name: '', professionId: '' }); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => adminAPI.services.update(id, data), onSuccess: () => { invalidate(); setEditId(null); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => adminAPI.services.remove(id), onSuccess: invalidate });

  const startEdit = (item: Item) => {
    setEditId(item.id);
    setForm({ name: item.name, professionId: item.profession?.id ?? '' });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="font-semibold text-white">Услуги</h3>
        <button onClick={() => { setAdding(true); setForm({ name: '', professionId: '' }); }} className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={14} /> Добавить
        </button>
      </div>
      <div className="divide-y divide-slate-800">
        {adding && (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50">
            <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Название" className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500" />
            <select value={form.professionId} onChange={e => setForm(f => ({ ...f, professionId: e.target.value }))} className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:border-primary-500 outline-none">
              <option value="">— Профессия —</option>
              {professions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={() => createMut.mutate(form)} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
            <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-white"><X size={16} /></button>
          </div>
        )}
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800/30 group">
            {editId === item.id ? (
              <>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500" />
                <select value={form.professionId} onChange={e => setForm(f => ({ ...f, professionId: e.target.value }))} className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:border-primary-500 outline-none">
                  <option value="">— Профессия —</option>
                  {professions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={() => updateMut.mutate({ id: item.id, data: form })} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
                <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-200">{item.name}</span>
                <span className="text-xs text-slate-500">{item.profession?.name ?? '—'}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
                  <button onClick={() => deleteMut.mutate(item.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && !adding && <div className="px-4 py-4 text-sm text-slate-500 text-center">Нет записей</div>}
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'structure', label: 'Структура' },
  { id: 'filters', label: 'Фильтры поиска' },
  { id: 'orgs', label: 'Организации' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function AdminPage() {
  const [tab, setTab] = useState<TabId>('structure');

  return (
    <div className="min-h-screen bg-slate-950 p-4 pb-24 lg:p-8 lg:pb-16">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white">Администрирование справочников</h1>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'structure' && (
          <div className="grid gap-4 md:grid-cols-2">
            <SimpleTable title="Области деятельности" queryKey="admin-fields-of-activity" apiModule={adminAPI.fieldsOfActivity} />
            <ProfessionTable />
            <div className="md:col-span-2">
              <ServiceTable />
            </div>
          </div>
        )}

        {tab === 'filters' && (
          <div className="grid gap-4 md:grid-cols-2">
            <SimpleTable title="Жанры" queryKey="admin-genres" apiModule={adminAPI.genres} />
            <SimpleTable title="Формат работы" queryKey="admin-work-formats" apiModule={adminAPI.workFormats} />
            <SimpleTable title="Тип занятости" queryKey="admin-employment-types" apiModule={adminAPI.employmentTypes} />
            <SimpleTable title="Уровень мастерства" queryKey="admin-skill-levels" apiModule={adminAPI.skillLevels} />
            <SimpleTable title="Готовность к работе" queryKey="admin-availabilities" apiModule={adminAPI.availabilities} />
            <SimpleTable title="География" queryKey="admin-geographies" apiModule={adminAPI.geographies} />
            <SimpleTable
              title="Ценовые диапазоны"
              queryKey="admin-price-ranges"
              apiModule={adminAPI.priceRanges}
              extraFields={[
                { key: 'minValue', label: 'Мин', placeholder: 'Мин' },
                { key: 'maxValue', label: 'Макс', placeholder: 'Макс' },
              ]}
            />
          </div>
        )}

        {tab === 'orgs' && (
          <div className="grid gap-4 md:grid-cols-2">
            <SimpleTable title="Группы / Артисты" queryKey="admin-artists" apiModule={adminAPI.artists} />
            <SimpleTable
              title="Работодатели"
              queryKey="admin-employers"
              apiModule={adminAPI.employers}
              extraFields={[
                { key: 'inn', label: 'ИНН', placeholder: 'ИНН' },
                { key: 'ogrn', label: 'ОГРН', placeholder: 'ОГРН' },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
