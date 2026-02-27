import { useState } from 'react';
import { ChevronDown, X, Loader2, Check } from 'lucide-react';
import {
  useSearchStore,
  useFieldsOfActivity,
  useProfessions,
  useServices,
  useGenres,
  useWorkFormats,
  useEmploymentTypes,
  useSkillLevels,
  useAvailabilities,
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
        className={`w-full flex items-center justify-between py-3 text-left transition-colors ${
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
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
    professionId,
    serviceId,
    genreId,
    workFormatId,
    employmentTypeId,
    skillLevelId,
    availabilityId,
    setFieldId,
    setProfessionId,
    setServiceId,
    setGenreId,
    setWorkFormatId,
    setEmploymentTypeId,
    setSkillLevelId,
    setAvailabilityId,
    resetAllFilters,
    setPage,
  } = useSearchStore();

  const { data: fields, isLoading: fieldsLoading } = useFieldsOfActivity();
  const { data: professions, isLoading: professionsLoading } = useProfessions(fieldId || undefined);
  const { data: services, isLoading: servicesLoading } = useServices(
    professionId || undefined,
    fieldId || undefined
  );
  const { data: genres, isLoading: genresLoading } = useGenres(serviceId || undefined);
  const { data: workFormats, isLoading: workFormatsLoading } = useWorkFormats();
  const { data: employmentTypes, isLoading: employmentTypesLoading } = useEmploymentTypes();
  const { data: skillLevels, isLoading: skillLevelsLoading } = useSkillLevels();
  const { data: availabilities, isLoading: availabilitiesLoading } = useAvailabilities();

  const activeCount = [
    fieldId, professionId, serviceId, genreId,
    workFormatId, employmentTypeId, skillLevelId, availabilityId,
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-base">Фильтры</span>
            {activeCount > 0 && (
              <span className="bg-primary-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
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
          disabled={!fieldId}
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

        <FilterSection
          title="Жанр"
          value={genreId}
          items={genres || []}
          loading={genresLoading}
          disabled={!serviceId}
          onSelect={wrap(setGenreId)}
        />

        <FilterSection
          title="Формат работы"
          value={workFormatId}
          items={workFormats || []}
          loading={workFormatsLoading}
          onSelect={wrap(setWorkFormatId)}
        />

        <FilterSection
          title="Тип занятости"
          value={employmentTypeId}
          items={employmentTypes || []}
          loading={employmentTypesLoading}
          onSelect={wrap(setEmploymentTypeId)}
        />

        <FilterSection
          title="Уровень навыка"
          value={skillLevelId}
          items={skillLevels || []}
          loading={skillLevelsLoading}
          onSelect={wrap(setSkillLevelId)}
        />

        <FilterSection
          title="Доступность"
          value={availabilityId}
          items={availabilities || []}
          loading={availabilitiesLoading}
          onSelect={wrap(setAvailabilityId)}
        />
      </div>
    </div>
  );
}
