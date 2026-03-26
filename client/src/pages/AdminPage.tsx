import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { adminAPI } from '../lib/api';
import { Plus, Pencil, Trash2, Check, X, ChevronRight } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Item { id: string; name: string; [key: string]: any }

// ─── Simple name-only CRUD table (used in Filters / Orgs tabs) ──────────────

function SimpleTable({
  title,
  queryKey,
  apiModule,
  extraFields,
  collapsible = false,
}: {
  title: string;
  queryKey: string;
  apiModule: { list: () => any; create: (d: any) => any; update: (id: string, d: any) => any; remove: (id: string) => any };
  extraFields?: { key: string; label: string; placeholder?: string }[];
  collapsible?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
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

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-white">
              <ChevronRight size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
          )}
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        {(!collapsible || open) && (
          <button
            onClick={() => { setAdding(true); setForm({}); }}
            className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} /> Добавить
          </button>
        )}
      </div>

      {(!collapsible || open) && <div className="divide-y divide-slate-800">
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
            <button onClick={() => createMut.mutate(form)} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
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
                <button onClick={() => updateMut.mutate({ id: item.id, data: form })} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
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
      </div>}
    </div>
  );
}

// ─── Structure tree shared helpers ──────────────────────────────────────────

function InlineEdit({ value, onSave, onCancel }: {
  value: string; onSave: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(value);
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(name); if (e.key === 'Escape') onCancel(); }}
        className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
      />
      <button onClick={() => onSave(name)} className="text-green-400 hover:text-green-300 flex-shrink-0"><Check size={14} /></button>
      <button onClick={onCancel} className="text-slate-400 hover:text-white flex-shrink-0"><X size={14} /></button>
    </div>
  );
}

function AddRow({ placeholder, onAdd, onCancel }: {
  placeholder: string; onAdd: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onAdd(name.trim()); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
      />
      <button onClick={() => name.trim() && onAdd(name.trim())} className="text-green-400 hover:text-green-300 flex-shrink-0"><Check size={14} /></button>
      <button onClick={onCancel} className="text-slate-400 hover:text-white flex-shrink-0"><X size={14} /></button>
    </div>
  );
}

// ─── Service (leaf node) ─────────────────────────────────────────────────────

function ServiceRow({ service, onUpdate, onDelete }: {
  service: Item; onUpdate: (name: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-700/30 group rounded">
      {editing ? (
        <InlineEdit
          value={service.name}
          onSave={name => { onUpdate(name); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0 ml-1" />
          <span className="flex-1 text-sm text-slate-300">{service.name}</span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={12} /></button>
            <button onClick={onDelete} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={12} /></button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Profession node ─────────────────────────────────────────────────────────

function ProfessionNode({ profession, services, qc }: {
  profession: Item; services: Item[]; qc: QueryClient;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingService, setAddingService] = useState(false);

  const invalidateP = () => qc.invalidateQueries({ queryKey: ['admin-professions'] });
  const invalidateS = () => qc.invalidateQueries({ queryKey: ['admin-services'] });

  const updateMut = useMutation({
    mutationFn: (name: string) => adminAPI.professions.update(profession.id, { name, directionId: profession.direction?.id }),
    onSuccess: () => { invalidateP(); setEditing(false); },
  });
  const deleteMut = useMutation({
    mutationFn: () => adminAPI.professions.remove(profession.id),
    onSuccess: invalidateP,
  });
  const addServiceMut = useMutation({
    mutationFn: (name: string) => adminAPI.services.create({ name, professionId: profession.id }),
    onSuccess: () => { invalidateS(); setAddingService(false); },
  });
  const updateServiceMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      adminAPI.services.update(id, { name, professionId: profession.id }),
    onSuccess: invalidateS,
  });
  const deleteServiceMut = useMutation({
    mutationFn: (id: string) => adminAPI.services.remove(id),
    onSuccess: invalidateS,
  });

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 hover:bg-slate-800/70 group">
        <button onClick={() => setOpen(o => !o)} className="text-slate-500 hover:text-white flex-shrink-0">
          <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editing ? (
          <InlineEdit
            value={profession.name}
            onSave={name => updateMut.mutate(name)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="flex-1 text-sm font-medium text-slate-200">{profession.name}</span>
            <span className="text-xs text-slate-600 flex-shrink-0">{services.length} усл.</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={12} /></button>
              <button onClick={() => deleteMut.mutate()} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={12} /></button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="px-3 py-2 space-y-0.5 bg-slate-900/60">
          {services.map(service => (
            <ServiceRow
              key={service.id}
              service={service}
              onUpdate={name => updateServiceMut.mutate({ id: service.id, name })}
              onDelete={() => deleteServiceMut.mutate(service.id)}
            />
          ))}

          {services.length === 0 && !addingService && (
            <p className="text-xs text-slate-600 px-2 py-1">Нет услуг</p>
          )}

          {addingService ? (
            <div className="px-2 pt-1">
              <AddRow
                placeholder="Название услуги"
                onAdd={name => addServiceMut.mutate(name)}
                onCancel={() => setAddingService(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingService(true)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary-400 transition-colors px-2 pt-1.5 pb-0.5"
            >
              <Plus size={11} /> Добавить услугу
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Direction node ──────────────────────────────────────────────────────────

function DirectionNode({ direction, professions, allServices, qc }: {
  direction: Item; professions: Item[]; allServices: Item[]; qc: QueryClient;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingProfession, setAddingProfession] = useState(false);

  const invalidateD = () => qc.invalidateQueries({ queryKey: ['admin-directions'] });
  const invalidateP = () => qc.invalidateQueries({ queryKey: ['admin-professions'] });

  const updateMut = useMutation({
    mutationFn: (name: string) => adminAPI.directions.update(direction.id, { name, fieldOfActivityId: direction.fieldOfActivity?.id }),
    onSuccess: () => { invalidateD(); setEditing(false); },
  });
  const deleteMut = useMutation({
    mutationFn: () => adminAPI.directions.remove(direction.id),
    onSuccess: invalidateD,
  });
  const addProfessionMut = useMutation({
    mutationFn: (name: string) => adminAPI.professions.create({ name, directionId: direction.id }),
    onSuccess: () => { invalidateP(); setAddingProfession(false); },
  });

  return (
    <div className="border border-slate-700/40 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/20 hover:bg-slate-800/50 group">
        <button onClick={() => setOpen(o => !o)} className="text-slate-500 hover:text-white flex-shrink-0">
          <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editing ? (
          <InlineEdit
            value={direction.name}
            onSave={name => updateMut.mutate(name)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold text-slate-100">{direction.name}</span>
            <span className="text-xs text-slate-600 flex-shrink-0">{professions.length} проф.</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={13} /></button>
              <button onClick={() => deleteMut.mutate()} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={13} /></button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="px-3 py-2 space-y-1.5 bg-slate-900/40">
          {professions.map(prof => (
            <ProfessionNode
              key={prof.id}
              profession={prof}
              services={allServices.filter(s => s.profession?.id === prof.id)}
              qc={qc}
            />
          ))}

          {professions.length === 0 && !addingProfession && (
            <p className="text-xs text-slate-600 py-1">Нет профессий</p>
          )}

          {addingProfession ? (
            <AddRow
              placeholder="Название профессии"
              onAdd={name => addProfessionMut.mutate(name)}
              onCancel={() => setAddingProfession(false)}
            />
          ) : (
            <button
              onClick={() => setAddingProfession(true)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary-400 transition-colors"
            >
              <Plus size={12} /> Добавить профессию
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Field of activity node ──────────────────────────────────────────────────

function FieldNode({ field, directions, allProfessions, allServices, qc }: {
  field: Item; directions: Item[]; allProfessions: Item[]; allServices: Item[]; qc: QueryClient;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingDirection, setAddingDirection] = useState(false);

  const invalidateF = () => qc.invalidateQueries({ queryKey: ['admin-fields-of-activity'] });
  const invalidateD = () => qc.invalidateQueries({ queryKey: ['admin-directions'] });

  const updateMut = useMutation({
    mutationFn: (name: string) => adminAPI.fieldsOfActivity.update(field.id, { name }),
    onSuccess: () => { invalidateF(); setEditing(false); },
  });
  const deleteMut = useMutation({
    mutationFn: () => adminAPI.fieldsOfActivity.remove(field.id),
    onSuccess: invalidateF,
  });
  const addDirectionMut = useMutation({
    mutationFn: (name: string) => adminAPI.directions.create({ name, fieldOfActivityId: field.id }),
    onSuccess: () => { invalidateD(); setAddingDirection(false); },
  });

  const profCount = directions.reduce(
    (acc, dir) => acc + allProfessions.filter(p => p.direction?.id === dir.id).length,
    0
  );

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      {/* Field header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-800/30 hover:bg-slate-800/50 group">
        <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-white flex-shrink-0">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editing ? (
          <InlineEdit
            value={field.name}
            onSave={name => updateMut.mutate(name)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="flex-1 font-bold text-white">{field.name}</span>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {directions.length} напр. · {profCount} проф.
            </span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
              <button onClick={() => deleteMut.mutate()} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
          </>
        )}
      </div>

      {/* Directions */}
      {open && (
        <div className="p-3 space-y-2">
          {directions.map(dir => (
            <DirectionNode
              key={dir.id}
              direction={dir}
              professions={allProfessions.filter(p => p.direction?.id === dir.id)}
              allServices={allServices}
              qc={qc}
            />
          ))}

          {directions.length === 0 && !addingDirection && (
            <p className="text-sm text-slate-600 py-1 px-1">Нет направлений</p>
          )}

          {addingDirection ? (
            <AddRow
              placeholder="Название направления"
              onAdd={name => addDirectionMut.mutate(name)}
              onCancel={() => setAddingDirection(false)}
            />
          ) : (
            <button
              onClick={() => setAddingDirection(true)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-400 transition-colors px-1"
            >
              <Plus size={13} /> Добавить направление
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Structure tree root ─────────────────────────────────────────────────────

function StructureTree() {
  const qc = useQueryClient();
  const [addingField, setAddingField] = useState(false);

  const { data: fields = [] } = useQuery<Item[]>({
    queryKey: ['admin-fields-of-activity'],
    queryFn: () => adminAPI.fieldsOfActivity.list().then((r: any) => r.data),
  });
  const { data: directions = [] } = useQuery<Item[]>({
    queryKey: ['admin-directions'],
    queryFn: () => adminAPI.directions.list().then((r: any) => r.data),
  });
  const { data: professions = [] } = useQuery<Item[]>({
    queryKey: ['admin-professions'],
    queryFn: () => adminAPI.professions.list().then((r: any) => r.data),
  });
  const { data: services = [] } = useQuery<Item[]>({
    queryKey: ['admin-services'],
    queryFn: () => adminAPI.services.list().then((r: any) => r.data),
  });

  const invalidateF = () => qc.invalidateQueries({ queryKey: ['admin-fields-of-activity'] });

  const addFieldMut = useMutation({
    mutationFn: (name: string) => adminAPI.fieldsOfActivity.create({ name }),
    onSuccess: () => { invalidateF(); setAddingField(false); },
  });

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <FieldNode
          key={field.id}
          field={field}
          directions={directions.filter(d => d.fieldOfActivity?.id === field.id)}
          allProfessions={professions}
          allServices={services}
          qc={qc}
        />
      ))}

      {fields.length === 0 && !addingField && (
        <div className="text-center py-8 text-slate-500 text-sm">Нет сфер деятельности</div>
      )}

      {addingField ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <AddRow
            placeholder="Название сферы деятельности"
            onAdd={name => addFieldMut.mutate(name)}
            onCancel={() => setAddingField(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddingField(true)}
          className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> Добавить сферу деятельности
        </button>
      )}
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
      <div className="max-w-3xl mx-auto space-y-6">
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

        {tab === 'structure' && <StructureTree />}

        {tab === 'filters' && (
          <div className="grid gap-4 md:grid-cols-2">
            <SimpleTable collapsible title="Жанры" queryKey="admin-genres" apiModule={adminAPI.genres} />
            <SimpleTable collapsible title="Формат работы" queryKey="admin-work-formats" apiModule={adminAPI.workFormats} />
            <SimpleTable collapsible title="Тип занятости" queryKey="admin-employment-types" apiModule={adminAPI.employmentTypes} />
            <SimpleTable collapsible title="Уровень мастерства" queryKey="admin-skill-levels" apiModule={adminAPI.skillLevels} />
            <SimpleTable collapsible title="Готовность к работе" queryKey="admin-availabilities" apiModule={adminAPI.availabilities} />
            <SimpleTable collapsible title="География" queryKey="admin-geographies" apiModule={adminAPI.geographies} />
            <SimpleTable
              collapsible
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
