import { useState } from 'react';
import { ChevronDown, X, Loader2, Check } from 'lucide-react';
import {
  useSearchStore,
  useFieldsOfActivity,
  useDirections,
  useProfessions,
  useServices,
  useGenres,
  useWorkFormats,
  useEmploymentTypes,
  useSkillLevels,
  useAvailabilities,
  useGeographies,
} from '../stores/searchStore';

// ─── Section label divider ──────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-slate-700/50" />
    </div>
  );
}

// ─── Single filter accordion section ──────────────────────────────────────
interface FilterSectionProps {
  title: string;
  value: string | null;
  items: { id: string; name: string; userCount?: number }[];
  loading?: boolean;
  disabled?: boolean;
  indent?: boolean;
  maxVisible?: number;
  onSelect: (id: string | null) => void;
}

function FilterSection({
  title, value, items, loading, disabled = false,
  indent = false, maxVisible = 6, onSelect,
}: FilterSectionProps) {
  const [open, setOpen] = useState(!!value);
  const [showAll, setShowAll] = useState(false);
  const selected = items.find(i => i.id === value);
  const visible = showAll ? items : items.slice(0, maxVisible);
  const remainder = items.length - maxVisible;

  return (
    <div className={indent ? 'ml-3 border-l border-slate-700/40 pl-3' : ''}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between py-2 text-left transition-colors ${
          disabled ? 'opacity-35 cursor-not-allowed' : 'hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`text-sm font-medium truncate ${value ? 'text-primary-400' : 'text-slate-300'}`}>
            {title}
          </span>
          {selected && (
            <span className="text-xs text-primary-300/70 truncate">{selected.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          {loading && <Loader2 size={13} className="animate-spin text-slate-400" />}
          {value && !disabled && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(null); }}
              className="p-0.5 text-slate-400 hover:text-white transition-colors rounded"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={15}
            className={`text-slate-500 transition-transform duration-200 ${open && !disabled ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && !disabled && (
        <div className="pb-2.5 space-y-0.5">
          {loading ? (
            <div className="space-y-1.5 py-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-7 bg-slate-700/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-slate-500 text-xs py-2 px-2">Нет вариантов</p>
          ) : (
            <>
              {visible.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(value === item.id ? null : item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                    value === item.id
                      ? 'bg-primary-500/15 text-primary-400'
                      : 'text-slate-300 hover:bg-slate-700/40 hover:text-white'
                  }`}
                >
                  <span className="truncate text-left">{item.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {item.userCount !== undefined && item.userCount > 0 && (
                      <span className="text-xs text-slate-500">{item.userCount}</span>
                    )}
                    {value === item.id && <Check size={13} className="text-primary-400" />}
                  </div>
                </button>
              ))}
              {!showAll && remainder > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-left text-xs text-slate-500 hover:text-slate-300 px-2.5 py-1 transition-colors"
                >
                  + ещё {remainder}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────
interface FilterPanelProps {
  showHeader?: boolean;
}

export default function FilterPanel({ showHeader = true }: FilterPanelProps) {
  const {
    fieldId, directionId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
    geographyId, priceMin, priceMax, customFilterValues,
    setFieldId, setDirectionId, setProfessionId, setServiceId, setGenreId,
    setWorkFormatId, setEmploymentTypeId, setSkillLevelId, setAvailabilityId,
    setGeographyId, setPriceMin, setPriceMax, setCustomFilterValue,
    resetAllFilters, setPage,
  } = useSearchStore();

  const { data: fields,          isLoading: fieldsLoading }          = useFieldsOfActivity();
  const { data: directions,      isLoading: directionsLoading }      = useDirections(fieldId || undefined);
  const { data: professions,     isLoading: professionsLoading }     = useProfessions(directionId || undefined);
  const { data: services,        isLoading: servicesLoading }        = useServices(directionId || undefined);
  const { data: genres,          isLoading: genresLoading }          = useGenres();
  const { data: workFormats,     isLoading: workFormatsLoading }     = useWorkFormats();
  const { data: employmentTypes, isLoading: employmentTypesLoading } = useEmploymentTypes();
  const { data: skillLevels,     isLoading: skillLevelsLoading }     = useSkillLevels();
  const { data: availabilities,  isLoading: availabilitiesLoading }  = useAvailabilities();
  const { data: geographies,     isLoading: geographiesLoading }     = useGeographies();

  // Derive allowed filter types: from selected service (sources from direction) or from selected direction
  const selectedService   = serviceId   ? services?.find(s  => s.id  === serviceId)   : null;
  const selectedDirection = directionId ? directions?.find(d => d.id === directionId) : null;
  const allowedTypes = selectedService?.allowedFilterTypes ?? selectedDirection?.allowedFilterTypes ?? null;

  // Attribute filters only visible when a direction is chosen
  const hasAttributes = !!directionId;
  const showAttr = (key: string) => hasAttributes && (allowedTypes === null || allowedTypes.includes(key));

  // Custom filters from the selected direction
  const directionCustomFilters = selectedDirection?.customFilters ?? [];
  const customFilterCount = Object.keys(customFilterValues).length;

  const activeCount = [
    fieldId, directionId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
    geographyId, priceMin || null, priceMax || null,
  ].filter(Boolean).length + customFilterCount;

  const wrap = (setter: (v: string | null) => void, downstream?: () => void) =>
    (id: string | null) => { setter(id); downstream?.(); setPage(1); };

  return (
    <div className="flex flex-col h-full">
      {/* Header (sidebar mode) */}
      {showHeader && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">Фильтры</span>
            {activeCount > 0 && (
              <span className="bg-primary-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button onClick={resetAllFilters} className="text-xs text-slate-400 hover:text-white transition-colors">
              Сбросить всё
            </button>
          )}
        </div>
      )}

      {/* "Clear all" inside BottomSheet (no own header) */}
      {!showHeader && activeCount > 0 && (
        <div className="flex justify-end mb-1 px-4">
          <button onClick={resetAllFilters} className="text-xs text-slate-400 hover:text-white transition-colors">
            Сбросить всё
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ══ Специализация ══ */}
        <SectionLabel>Специализация</SectionLabel>

        <FilterSection
          title="Сфера"
          value={fieldId}
          items={fields || []}
          loading={fieldsLoading}
          onSelect={wrap(setFieldId, () => {
            setDirectionId(null); setProfessionId(null); setServiceId(null); setGenreId(null);
            setWorkFormatId(null); setEmploymentTypeId(null); setSkillLevelId(null);
            setAvailabilityId(null); setGeographyId(null); setPriceMin(''); setPriceMax('');
          })}
        />

        <FilterSection
          title="Направление"
          value={directionId}
          items={directions || []}
          loading={directionsLoading}
          disabled={!fieldId}
          indent
          onSelect={wrap(setDirectionId, () => {
            setProfessionId(null); setServiceId(null); setGenreId(null);
            setWorkFormatId(null); setEmploymentTypeId(null); setSkillLevelId(null);
            setAvailabilityId(null); setGeographyId(null); setPriceMin(''); setPriceMax('');
            directionCustomFilters.forEach(cf => setCustomFilterValue(cf.id, null));
          })}
        />

        <FilterSection
          title="Профессия"
          value={professionId}
          items={professions || []}
          loading={professionsLoading}
          disabled={!directionId}
          indent
          onSelect={wrap(setProfessionId, () => { setServiceId(null); setGenreId(null); })}
        />

        <FilterSection
          title="Услуга"
          value={serviceId}
          items={services || []}
          loading={servicesLoading}
          disabled={!directionId}
          indent
          onSelect={wrap(setServiceId, () => setGenreId(null))}
        />

        {/* ══ Характеристики ══ */}
        {hasAttributes ? (
          <>
            <SectionLabel>Характеристики</SectionLabel>

            {showAttr('genre') && (
              <FilterSection title="Жанр" value={genreId} items={genres || []} loading={genresLoading} onSelect={wrap(setGenreId)} />
            )}
            {showAttr('workFormat') && (
              <FilterSection title="Формат работы" value={workFormatId} items={workFormats || []} loading={workFormatsLoading} onSelect={wrap(setWorkFormatId)} />
            )}
            {showAttr('employmentType') && (
              <FilterSection title="Тип занятости" value={employmentTypeId} items={employmentTypes || []} loading={employmentTypesLoading} onSelect={wrap(setEmploymentTypeId)} />
            )}
            {showAttr('skillLevel') && (
              <FilterSection title="Уровень навыка" value={skillLevelId} items={skillLevels || []} loading={skillLevelsLoading} onSelect={wrap(setSkillLevelId)} />
            )}
            {showAttr('availability') && (
              <FilterSection title="Доступность" value={availabilityId} items={availabilities || []} loading={availabilitiesLoading} onSelect={wrap(setAvailabilityId)} />
            )}
            {showAttr('geography') && (
              <FilterSection title="Город / Регион" value={geographyId} items={geographies || []} loading={geographiesLoading} onSelect={wrap(setGeographyId)} />
            )}
            {showAttr('priceRange') && (
              <div className="py-2">
                <span className={`text-sm font-medium ${priceMin || priceMax ? 'text-primary-400' : 'text-slate-300'}`}>
                  Бюджет (₽)
                </span>
                <div className="flex gap-2 mt-2">
                  <input
                    type="number" min={0} placeholder="От" value={priceMin}
                    onChange={e => { setPriceMin(e.target.value); setPage(1); }}
                    className="flex-1 px-2.5 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <input
                    type="number" min={0} placeholder="До" value={priceMax}
                    onChange={e => { setPriceMax(e.target.value); setPage(1); }}
                    className="flex-1 px-2.5 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
            )}

            {directionCustomFilters.length > 0 && (
              <>
                <SectionLabel>Дополнительные</SectionLabel>
                {directionCustomFilters.map(cf => (
                  <FilterSection
                    key={cf.id}
                    title={cf.name}
                    value={customFilterValues[cf.id] ?? null}
                    items={cf.values.map(v => ({ id: v.id, name: v.value }))}
                    onSelect={id => { setCustomFilterValue(cf.id, id); setPage(1); }}
                  />
                ))}
              </>
            )}

            {allowedTypes !== null && allowedTypes.length === 0 && directionCustomFilters.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">
                Для выбранного направления характеристики не настроены
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-600 py-5 text-center px-3">
            Выберите направление, чтобы увидеть характеристики
          </p>
        )}
      </div>
    </div>
  );
}
