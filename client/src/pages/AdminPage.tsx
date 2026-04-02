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
  const [open, setOpen] = useState(false);
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
      <div className={`flex items-center justify-between px-4 py-3 ${(!collapsible || open) ? 'border-b border-slate-800' : ''}`}>
        <div className="flex items-center gap-2">
          {collapsible && (
            <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-white">
              <ChevronRight size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
          )}
          <h3 className="font-semibold text-white">{title}</h3>
          <span className="text-xs text-slate-500">{items.length}</span>
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

        {items.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800/30 group">
            <span className="text-xs text-slate-600 w-5 text-right flex-shrink-0">{idx + 1}</span>
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

// ─── System filter type definitions ─────────────────────────────────────────

const SYSTEM_FILTER_TYPES = [
  { key: 'genre',          label: 'Жанры' },
  { key: 'workFormat',     label: 'Формат работы' },
  { key: 'employmentType', label: 'Тип занятости' },
  { key: 'skillLevel',     label: 'Уровень мастерства' },
  { key: 'availability',   label: 'Готовность к работе' },
  { key: 'geography',      label: 'География' },
  { key: 'priceRange',     label: 'Ценовые диапазоны' },
];

// ─── Direction node ──────────────────────────────────────────────────────────

function DirectionNode({ direction, allProfessions, allCustomFilters, allServices, onUnlink, qc }: {
  direction: Item; allProfessions: Item[]; allCustomFilters: CFilter[]; allServices: { id: string; name: string }[]; onUnlink: () => void; qc: QueryClient;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const invalidateD = () => qc.invalidateQueries({ queryKey: ['admin-directions'] });
  const invalidateP = () => qc.invalidateQueries({ queryKey: ['admin-professions'] });

  const attachedIds: string[] = (direction.customFilters ?? []).map((f: any) => f.id);
  const attachedTypes: string[] = direction.allowedFilterTypes ?? [];
  const totalAttached = attachedIds.length + attachedTypes.length;
  const attachedServiceIds: string[] = (direction.services ?? []).map((s: any) => s.id);
  const attachedProfessions = allProfessions.filter(p => p.direction?.id === direction.id);

  const updateMut = useMutation({
    mutationFn: (name: string) => adminAPI.directions.update(direction.id, { name }),
    onSuccess: () => { invalidateD(); setEditing(false); },
  });
  const deleteMut = useMutation({
    mutationFn: () => adminAPI.directions.remove(direction.id),
    onSuccess: invalidateD,
  });
  const setFiltersMut = useMutation({
    mutationFn: ({ filterIds, filterTypes }: { filterIds: string[]; filterTypes: string[] }) =>
      adminAPI.directions.setFilters(direction.id, filterIds, filterTypes),
    onSuccess: invalidateD,
  });
  const setServicesMut = useMutation({
    mutationFn: (serviceIds: string[]) => adminAPI.directions.setServices(direction.id, serviceIds),
    onSuccess: invalidateD,
  });
  const setProfMut = useMutation({
    mutationFn: ({ profId, dirId }: { profId: string; dirId: string | null }) =>
      adminAPI.professions.setDirection(profId, dirId),
    onSuccess: invalidateP,
  });

  const toggleService = (serviceId: string) => {
    const next = attachedServiceIds.includes(serviceId)
      ? attachedServiceIds.filter(id => id !== serviceId)
      : [...attachedServiceIds, serviceId];
    setServicesMut.mutate(next);
  };
  const toggleType = (typeKey: string) => {
    const newTypes = attachedTypes.includes(typeKey) ? attachedTypes.filter(t => t !== typeKey) : [...attachedTypes, typeKey];
    setFiltersMut.mutate({ filterIds: attachedIds, filterTypes: newTypes });
  };
  const toggleFilter = (filterId: string) => {
    const newIds = attachedIds.includes(filterId) ? attachedIds.filter(id => id !== filterId) : [...attachedIds, filterId];
    setFiltersMut.mutate({ filterIds: newIds, filterTypes: attachedTypes });
  };
  const toggleProfession = (prof: Item) => {
    const isAttached = prof.direction?.id === direction.id;
    setProfMut.mutate({ profId: prof.id, dirId: isAttached ? null : direction.id });
  };

  return (
    <div className="border border-slate-700/40 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/20 hover:bg-slate-800/50 group">
        <button onClick={() => setOpen(o => !o)} className="text-slate-500 hover:text-white flex-shrink-0">
          <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editing ? (
          <InlineEdit value={direction.name} onSave={name => updateMut.mutate(name)} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold text-slate-100">{direction.name}</span>
            {attachedProfessions.length > 0 && <span className="text-xs text-slate-500/80 flex-shrink-0">{attachedProfessions.length} проф.</span>}
            {attachedServiceIds.length > 0 && <span className="text-xs text-emerald-500/80 flex-shrink-0">{attachedServiceIds.length} усл.</span>}
            {totalAttached > 0 && <span className="text-xs text-primary-500/80 flex-shrink-0">{totalAttached} ф.</span>}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={onUnlink} className="text-slate-400 hover:text-amber-400 p-1" title="Открепить от сферы"><X size={12} /></button>
              <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={13} /></button>
              <button onClick={() => deleteMut.mutate()} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={13} /></button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="bg-slate-900/50 divide-y divide-slate-800/60">

          {/* ── Профессии ── */}
          <div className="px-4 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Профессии</p>
            {allProfessions.length === 0 ? (
              <p className="text-xs text-slate-600">Добавьте профессии во вкладке «Профессии»</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allProfessions.map(p => {
                  const on = p.direction?.id === direction.id;
                  return (
                    <button key={p.id} onClick={() => toggleProfession(p)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                        on ? 'bg-slate-500/20 text-slate-200 border-slate-500/40' : 'text-slate-600 border-slate-800 hover:border-slate-600 hover:text-slate-400'
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Услуги ── */}
          <div className="px-4 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Услуги</p>
            {allServices.length === 0 ? (
              <p className="text-xs text-slate-600">Добавьте услуги во вкладке «Услуги»</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allServices.map(s => {
                  const on = attachedServiceIds.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleService(s.id)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                        on ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'text-slate-600 border-slate-800 hover:border-slate-600 hover:text-slate-400'
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Фильтры ── */}
          <div className="px-4 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Фильтры</p>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {SYSTEM_FILTER_TYPES.map(f => {
                  const on = attachedTypes.includes(f.key);
                  return (
                    <button key={f.key} onClick={() => toggleType(f.key)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                        on ? 'bg-primary-500/15 text-primary-400 border-primary-500/40' : 'text-slate-600 border-slate-800 hover:border-slate-600 hover:text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              {allCustomFilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-slate-800/60">
                  {allCustomFilters.map(f => {
                    const on = attachedIds.includes(f.id);
                    return (
                      <button key={f.id} onClick={() => toggleFilter(f.id)}
                        className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                          on ? 'bg-primary-500/15 text-primary-400 border-primary-500/40' : 'text-slate-600 border-slate-800 hover:border-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {f.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Field of activity node ──────────────────────────────────────────────────

function FieldNode({ field, allDirections, allProfessions, allCustomFilters, allServices, qc }: {
  field: Item; allDirections: Item[]; allProfessions: Item[]; allCustomFilters: CFilter[]; allServices: { id: string; name: string }[]; qc: QueryClient;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [linkDirId, setLinkDirId] = useState('');

  const linkedDirections = allDirections.filter(d => d.fieldOfActivity?.id === field.id);
  const unlinkedDirections = allDirections.filter(d => !d.fieldOfActivity?.id);

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
  const linkDirMut = useMutation({
    mutationFn: (dirId: string) => adminAPI.directions.setSphere(dirId, field.id),
    onSuccess: () => { invalidateD(); setLinkDirId(''); },
  });

  const profCount = linkedDirections.reduce(
    (acc, dir) => acc + allProfessions.filter(p => p.direction?.id === dir.id).length, 0
  );

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-800/30 hover:bg-slate-800/50 group">
        <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-white flex-shrink-0">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editing ? (
          <InlineEdit value={field.name} onSave={name => updateMut.mutate(name)} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="flex-1 font-bold text-white">{field.name}</span>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {linkedDirections.length} напр. · {profCount} проф.
            </span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
              <button onClick={() => deleteMut.mutate()} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="p-3 space-y-2">
          {linkedDirections.map(dir => (
            <DirectionNode
              key={dir.id}
              direction={dir}
              allProfessions={allProfessions}
              allCustomFilters={allCustomFilters}
              allServices={allServices}
              onUnlink={() => adminAPI.directions.setSphere(dir.id, null).then(invalidateD)}
              qc={qc}
            />
          ))}

          {linkedDirections.length === 0 && unlinkedDirections.length === 0 && (
            <p className="text-sm text-slate-600 py-1 px-1">Нет направлений. Создайте их во вкладке «Направления»</p>
          )}

          {/* Link existing direction */}
          {unlinkedDirections.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={linkDirId}
                onChange={e => setLinkDirId(e.target.value)}
                className="flex-1 bg-slate-800 text-slate-300 text-xs px-2 py-1.5 rounded-lg outline-none border border-slate-700 focus:border-primary-500"
              >
                <option value="">— Привязать направление —</option>
                {unlinkedDirections.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {linkDirId && (
                <button
                  onClick={() => linkDirMut.mutate(linkDirId)}
                  className="text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Привязать
                </button>
              )}
            </div>
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
  const { data: allCustomFilters = [] } = useQuery<CFilter[]>({
    queryKey: ['admin-custom-filters'],
    queryFn: () => adminAPI.customFilters.list().then((r: any) => r.data),
  });
  const { data: allServices = [] } = useQuery<{ id: string; name: string }[]>({
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
          allDirections={directions}
          allProfessions={professions}
          allCustomFilters={allCustomFilters}
          allServices={allServices}
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

// ─── Custom filter card ──────────────────────────────────────────────────────

interface CFilter { id: string; name: string; values: { id: string; value: string; sortOrder: number }[] }

function CustomFilterCard({ filter, onUpdate, onDelete }: {
  filter: CFilter;
  onUpdate: (name: string, values: string[]) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [addingValue, setAddingValue] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const vals = filter.values.map(v => v.value);

  const saveValues = (newVals: string[]) => onUpdate(filter.name, newVals);
  const saveName = () => { onUpdate(editName.trim() || filter.name, vals); setEditingName(false); };

  const addValue = () => {
    if (!newValue.trim()) return;
    saveValues([...vals, newValue.trim()]);
    setNewValue(''); setAddingValue(false);
  };
  const deleteValue = (idx: number) => saveValues(vals.filter((_, i) => i !== idx));
  const saveValueEdit = (idx: number) => {
    if (!editingText.trim()) return;
    saveValues(vals.map((v, i) => i === idx ? editingText.trim() : v));
    setEditingIdx(null);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-800/30 hover:bg-slate-800/50 group">
        <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-white flex-shrink-0">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
              className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
            />
            <button onClick={saveName} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
            <button onClick={() => setEditingName(false)} className="text-slate-400 hover:text-white"><X size={14} /></button>
          </div>
        ) : (
          <>
            <span className="flex-1 font-semibold text-white">{filter.name}</span>
            <span className="text-xs text-slate-500 flex-shrink-0">{filter.values.length} зн.</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditName(filter.name); setEditingName(true); }} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
              <button onClick={onDelete} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="p-3 space-y-0.5">
          {vals.map((v, idx) => (
            <div key={idx} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800/30 group/v rounded">
              {editingIdx === idx ? (
                <>
                  <input
                    autoFocus value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveValueEdit(idx); if (e.key === 'Escape') setEditingIdx(null); }}
                    className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
                  />
                  <button onClick={() => saveValueEdit(idx)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                  <button onClick={() => setEditingIdx(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />
                  <span className="flex-1 text-sm text-slate-300">{v}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover/v:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingIdx(idx); setEditingText(v); }} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={12} /></button>
                    <button onClick={() => deleteValue(idx)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                  </div>
                </>
              )}
            </div>
          ))}

          {vals.length === 0 && !addingValue && (
            <p className="text-xs text-slate-600 px-2 py-1">Нет значений</p>
          )}

          {addingValue ? (
            <div className="flex items-center gap-2 px-2 pt-1">
              <input
                autoFocus value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addValue(); if (e.key === 'Escape') { setNewValue(''); setAddingValue(false); } }}
                placeholder="Новое значение"
                className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
              />
              <button onClick={addValue} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
              <button onClick={() => { setNewValue(''); setAddingValue(false); }} className="text-slate-400 hover:text-white"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingValue(true)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary-400 transition-colors px-2 pt-1.5 pb-0.5"
            >
              <Plus size={11} /> Добавить значение
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Custom filters section ───────────────────────────────────────────────────

function CustomFiltersSection() {
  const qc = useQueryClient();
  const [addingFilter, setAddingFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  const { data: filters = [] } = useQuery<CFilter[]>({
    queryKey: ['admin-custom-filters'],
    queryFn: () => adminAPI.customFilters.list().then((r: any) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-custom-filters'] });

  const createMut = useMutation({
    mutationFn: (data: { name: string; values: string[] }) => adminAPI.customFilters.create(data),
    onSuccess: () => { invalidate(); setAddingFilter(false); setNewFilterName(''); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name, values }: { id: string; name: string; values: string[] }) =>
      adminAPI.customFilters.update(id, { name, values }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminAPI.customFilters.remove(id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      {filters.map(filter => (
        <CustomFilterCard
          key={filter.id}
          filter={filter}
          onUpdate={(name, values) => updateMut.mutate({ id: filter.id, name, values })}
          onDelete={() => deleteMut.mutate(filter.id)}
        />
      ))}

      {filters.length === 0 && !addingFilter && (
        <div className="text-center py-8 text-slate-500 text-sm">Нет пользовательских фильтров</div>
      )}

      {addingFilter ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center gap-2">
            <input
              autoFocus value={newFilterName}
              onChange={e => setNewFilterName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newFilterName.trim()) createMut.mutate({ name: newFilterName.trim(), values: [] });
                if (e.key === 'Escape') { setAddingFilter(false); setNewFilterName(''); }
              }}
              placeholder="Название фильтра"
              className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded outline-none border border-slate-600 focus:border-primary-500"
            />
            <button
              onClick={() => newFilterName.trim() && createMut.mutate({ name: newFilterName.trim(), values: [] })}
              className="text-green-400 hover:text-green-300"
            ><Check size={16} /></button>
            <button onClick={() => { setAddingFilter(false); setNewFilterName(''); }} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingFilter(true)}
          className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> Добавить фильтр
        </button>
      )}
    </div>
  );
}

// ─── Directions reference tab ────────────────────────────────────────────────

function DirectionsTab() {
  const qc = useQueryClient();
  const { data: directions = [] } = useQuery<Item[]>({
    queryKey: ['admin-directions'],
    queryFn: () => adminAPI.directions.list().then((r: any) => r.data),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-directions'] });
  const createMut = useMutation({
    mutationFn: (name: string) => adminAPI.directions.create({ name }),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => adminAPI.directions.update(id, { name }),
    onSuccess: () => { invalidate(); setEditId(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminAPI.directions.remove(id),
    onSuccess: invalidate,
  });

  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">Направления</h3>
          <span className="text-xs text-slate-500">{directions.length}</span>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={14} /> Добавить
        </button>
      </div>
      <div className="divide-y divide-slate-800">
        {adding && (
          <div className="px-4 py-2 bg-slate-800/50">
            <AddRow placeholder="Название направления" onAdd={name => { createMut.mutate(name); setAdding(false); }} onCancel={() => setAdding(false)} />
          </div>
        )}
        {directions.map((dir, idx) => (
          <div key={dir.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800/30 group">
            <span className="text-xs text-slate-600 w-5 text-right flex-shrink-0">{idx + 1}</span>
            {editId === dir.id ? (
              <InlineEdit value={editName} onSave={name => updateMut.mutate({ id: dir.id, name })} onCancel={() => setEditId(null)} />
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-200">{dir.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditId(dir.id); setEditName(dir.name); }} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
                  <button onClick={() => deleteMut.mutate(dir.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {directions.length === 0 && !adding && <div className="px-4 py-4 text-sm text-slate-500 text-center">Нет записей</div>}
      </div>
    </div>
  );
}

// ─── Professions reference tab ───────────────────────────────────────────────

function ProfessionsTab() {
  const qc = useQueryClient();
  const { data: professions = [] } = useQuery<Item[]>({
    queryKey: ['admin-professions'],
    queryFn: () => adminAPI.professions.list().then((r: any) => r.data),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-professions'] });
  const createMut = useMutation({
    mutationFn: (name: string) => adminAPI.professions.create({ name }),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => adminAPI.professions.update(id, { name }),
    onSuccess: () => { invalidate(); setEditId(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminAPI.professions.remove(id),
    onSuccess: invalidate,
  });

  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">Профессии</h3>
          <span className="text-xs text-slate-500">{professions.length}</span>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={14} /> Добавить
        </button>
      </div>
      <div className="divide-y divide-slate-800">
        {adding && (
          <div className="px-4 py-2 bg-slate-800/50">
            <AddRow placeholder="Название профессии" onAdd={name => { createMut.mutate(name); setAdding(false); }} onCancel={() => setAdding(false)} />
          </div>
        )}
        {professions.map((p, idx) => (
          <div key={p.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800/30 group">
            <span className="text-xs text-slate-600 w-5 text-right flex-shrink-0">{idx + 1}</span>
            {editId === p.id ? (
              <InlineEdit value={editName} onSave={name => updateMut.mutate({ id: p.id, name })} onCancel={() => setEditId(null)} />
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-200">{p.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditId(p.id); setEditName(p.name); }} className="text-slate-400 hover:text-primary-400 p-1"><Pencil size={14} /></button>
                  <button onClick={() => deleteMut.mutate(p.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {professions.length === 0 && !adding && <div className="px-4 py-4 text-sm text-slate-500 text-center">Нет записей</div>}
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'structure',   label: 'Структура' },
  { id: 'spheres',     label: 'Сферы' },
  { id: 'directions',  label: 'Направления' },
  { id: 'professions', label: 'Профессии' },
  { id: 'services',    label: 'Услуги' },
  { id: 'filters',     label: 'Фильтры' },
  { id: 'orgs',        label: 'Организации' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  const [tab, setTab] = useState<TabId>('structure');

  return (
    <div className="min-h-screen bg-slate-950 p-4 pb-24 lg:p-8 lg:pb-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white">Администрирование справочников</h1>

        {/* Tab bar — scrollable on narrow screens */}
        <div className="overflow-x-auto pb-0.5">
          <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-max min-w-full">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'structure' && <StructureTree />}

        {tab === 'spheres' && (
          <SimpleTable
            title="Сферы деятельности"
            queryKey="admin-fields-of-activity"
            apiModule={adminAPI.fieldsOfActivity}
          />
        )}

        {tab === 'directions' && <DirectionsTab />}

        {tab === 'professions' && <ProfessionsTab />}

        {tab === 'services' && (
          <SimpleTable
            title="Услуги"
            queryKey="admin-services"
            apiModule={adminAPI.services}
          />
        )}

        {tab === 'filters' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                Системные фильтры поиска
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
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
            </div>

            <div className="border-t border-slate-800 pt-6">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                Пользовательские фильтры
              </h2>
              <CustomFiltersSection />
            </div>
          </div>
        )}

        {tab === 'orgs' && (
          <div className="grid gap-4 md:grid-cols-2">
            <SimpleTable collapsible title="Группы / Артисты" queryKey="admin-artists" apiModule={adminAPI.artists} />
            <SimpleTable
              collapsible
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
