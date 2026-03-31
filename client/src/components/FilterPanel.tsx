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

interface FilterPanelProps {
  /** When false, hides the panel title (e.g. inside BottomSheet which has its own header) */
  showHeader?: boolean;
}

interface FilterSectionProps {
  title: string;
  value: string | null;
  items: { id: string; name: string; userCount?: number }[];
  loading?: boolean;
  disabled?: boolean;
  onSelect: (id: string | null) => void;
}

function FilterSection({ title, value, items, loading, disabled, onSelect }: FilterSectionProps) {
  const [open, setOpen] = useState(!!value);
  const selected = items.find((i) => i.id === value);

  return (
    <div className="border-b border-slate-700/50 last:border-0">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={!!disabled}
        className={`w-full flex items-center justify-between py-2.5 text-left transition-colors ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-medium truncate ${value ? 'text-primary-400' : 'text-slate-300'}`}>
            {title}
          </span>
          {selected && (
            <span className="text-xs text-slate-400 truncate hidden sm:block">— {selected.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
          {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          {value && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
              className="p-0.5 hover:text-white text-slate-400 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && !disabled && (
        <div className="pb-3 space-y-0.5">
          {loading ? (
            <div className="space-y-1.5 py-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-slate-700/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-slate-500 text-sm py-2 px-2">Нет вариантов</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(value === item.id ? null : item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                  value === item.id
                    ? 'bg-primary-500/15 text-primary-400'
                    : 'text-slate-300 hover:bg-slate-700/40 hover:text-white'
                }`}
              >
                <span className="truncate">{item.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {item.userCount !== undefined && item.userCount > 0 && (
                    <span className="text-xs text-slate-500">{item.userCount}</span>
                  )}
                  {value === item.id && <Check size={14} className="text-primary-400" />}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function FilterPanel({ showHeader = true }: FilterPanelProps) {
  const {
    fieldId,
    directionId,
    professionId,
    serviceId,
    genreId,
    workFormatId,
    employmentTypeId,
    skillLevelId,
    availabilityId,
    geographyId,
    priceMin,
    priceMax,
    setFieldId,
    setDirectionId,
    setProfessionId,
    setServiceId,
    setGenreId,
    setWorkFormatId,
    setEmploymentTypeId,
    setSkillLevelId,
    setAvailabilityId,
    setGeographyId,
    setPriceMin,
    setPriceMax,
    resetAllFilters,
    setPage,
  } = useSearchStore();

  const { data: fields, isLoading: fieldsLoading } = useFieldsOfActivity();
  const { data: directions, isLoading: directionsLoading } = useDirections(fieldId || undefined);
  const { data: professions, isLoading: professionsLoading } = useProfessions(directionId || undefined);
  const { data: services, isLoading: servicesLoading } = useServices(
    professionId || undefined,
    fieldId || undefined
  );
  const { data: genres, isLoading: genresLoading } = useGenres();
  const { data: workFormats, isLoading: workFormatsLoading } = useWorkFormats();
  const { data: employmentTypes, isLoading: employmentTypesLoading } = useEmploymentTypes();
  const { data: skillLevels, isLoading: skillLevelsLoading } = useSkillLevels();
  const { data: availabilities, isLoading: availabilitiesLoading } = useAvailabilities();
  const { data: geographies, isLoading: geographiesLoading } = useGeographies();

  // Derive allowed filter types from selected service
  const selectedService = serviceId ? services?.find(s => s.id === serviceId) : null;
  const allowedTypes = selectedService?.allowedFilterTypes ?? null; // null = no service selected = show all
  const showFilter = (key: string) => allowedTypes === null || allowedTypes.includes(key);

  const activeCount = [
    fieldId, directionId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
    geographyId, priceMin || null, priceMax || null,
  ].filter(Boolean).length;

  const wrap = (setter: (v: string | null) => void, downstream?: () => void) =>
    (id: string | null) => {
      setter(id);
      downstream?.();
      setPage(1);
    };

  return (
    <div className="flex flex-col h-full">
      {/* Header — shown on sidebar; hidden inside BottomSheet (which has its own header) */}
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">Фильтры</span>
            {activeCount > 0 && (
              <span className="bg-primary-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              onClick={() => { resetAllFilters(); }}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Сбросить всё
            </button>
          )}
        </div>
      )}
      {/* Inside BottomSheet: show only "Clear all" inline when filters are active */}
      {!showHeader && activeCount > 0 && (
        <div className="flex justify-end mb-3 px-4">
          <button
            onClick={() => { resetAllFilters(); }}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Сбросить всё
          </button>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        <FilterSection
          title="Сфера деятельности"
          value={fieldId}
          items={fields || []}
          loading={fieldsLoading}
          onSelect={wrap(setFieldId, () => {
            setDirectionId(null);
            setProfessionId(null);
            setServiceId(null);
            setGenreId(null);
          })}
        />

        <FilterSection
          title="Направление"
          value={directionId}
          items={directions || []}
          loading={directionsLoading}
          disabled={!fieldId}
          onSelect={wrap(setDirectionId, () => {
            setProfessionId(null);
            setServiceId(null);
            setGenreId(null);
          })}
        />

        <FilterSection
          title="Профессия"
          value={professionId}
          items={professions || []}
          loading={professionsLoading}
          disabled={!directionId}
          onSelect={wrap(setProfessionId, () => {
            setServiceId(null);
            setGenreId(null);
          })}
        />

        <FilterSection
          title="Услуга"
          value={serviceId}
          items={services || []}
          loading={servicesLoading}
          disabled={!fieldId}
          onSelect={wrap(setServiceId, () => setGenreId(null))}
        />

        {showFilter('genre') && (
          <FilterSection title="Жанр" value={genreId} items={genres || []} loading={genresLoading} onSelect={wrap(setGenreId)} />
        )}
        {showFilter('workFormat') && (
          <FilterSection title="Формат работы" value={workFormatId} items={workFormats || []} loading={workFormatsLoading} onSelect={wrap(setWorkFormatId)} />
        )}
        {showFilter('employmentType') && (
          <FilterSection title="Тип занятости" value={employmentTypeId} items={employmentTypes || []} loading={employmentTypesLoading} onSelect={wrap(setEmploymentTypeId)} />
        )}
        {showFilter('skillLevel') && (
          <FilterSection title="Уровень навыка" value={skillLevelId} items={skillLevels || []} loading={skillLevelsLoading} onSelect={wrap(setSkillLevelId)} />
        )}
        {showFilter('availability') && (
          <FilterSection title="Доступность" value={availabilityId} items={availabilities || []} loading={availabilitiesLoading} onSelect={wrap(setAvailabilityId)} />
        )}
        {showFilter('geography') && (
          <FilterSection title="География" value={geographyId} items={geographies || []} loading={geographiesLoading} onSelect={wrap(setGeographyId)} />
        )}

        {showFilter('priceRange') && (
          <div className="border-b border-slate-700/50 last:border-0 py-2.5">
            <span className={`text-sm font-medium ${priceMin || priceMax ? 'text-primary-400' : 'text-slate-300'}`}>Бюджет (₽)</span>
            <div className="flex gap-2 mt-2">
              <input type="number" min={0} placeholder="От" value={priceMin} onChange={e => { setPriceMin(e.target.value); setPage(1); }} className="flex-1 px-2.5 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
              <input type="number" min={0} placeholder="До" value={priceMax} onChange={e => { setPriceMax(e.target.value); setPage(1); }} className="flex-1 px-2.5 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
          </div>
        )}

        {serviceId && allowedTypes !== null && allowedTypes.length === 0 && (
          <p className="text-xs text-slate-500 py-3 text-center">Для выбранной услуги фильтры не настроены</p>
        )}
      </div>
    </div>
  );
}
