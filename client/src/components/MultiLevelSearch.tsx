import { useState } from 'react';
import { Search, X, ChevronDown, Filter, Users, Loader2 } from 'lucide-react';
import { useSearchStore,
  useFieldsOfActivity,
  useProfessions,
  useServices,
  useGenres,
  useWorkFormats,
  useEmploymentTypes,
  useSkillLevels,
  useAvailabilities,
  useSearchResults, } from '../stores/searchStore';

// Level labels in Russian
const LEVEL_LABELS = {
  field: 'Сфера деятельности',
  profession: 'Профессия',
  service: 'Услуга',
  genre: 'Жанр',
  workFormat: 'Формат работы',
  employmentType: 'Тип занятости',
  skillLevel: 'Уровень навыка',
  availability: 'Доступность',
};

interface MultiLevelSearchProps {
  compact?: boolean;
  onSearch?: (filters: any) => void;
}

export default function MultiLevelSearch({ compact = false, onSearch }: MultiLevelSearchProps) {
  // Store state and actions
  const {
    fieldId,
    professionId,
    serviceId,
    genreId,
    workFormatId,
    employmentTypeId,
    skillLevelId,
    availabilityId,
    resultCount,
    setFieldId,
    setProfessionId,
    setServiceId,
    setGenreId,
    setWorkFormatId,
    setEmploymentTypeId,
    setSkillLevelId,
    setAvailabilityId,
    setPage,
    resetAllFilters,
    setResultCount,
    getFilters,
  } = useSearchStore();

  // UI state
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set());
  const [textSearch, setTextSearch] = useState('');

  // Fetch reference data
  const { data: fields, isLoading: fieldsLoading } = useFieldsOfActivity();
  const { data: professions, isLoading: professionsLoading } = useProfessions(fieldId || undefined);
  const { data: services, isLoading: servicesLoading } = useServices(professionId || undefined, fieldId || undefined);
  const { data: genres, isLoading: genresLoading } = useGenres(serviceId || undefined);
  const { data: workFormats, isLoading: workFormatsLoading } = useWorkFormats();
  const { data: employmentTypes, isLoading: employmentTypesLoading } = useEmploymentTypes();
  const { data: skillLevels, isLoading: skillLevelsLoading } = useSkillLevels();
  const { data: availabilities, isLoading: availabilitiesLoading } = useAvailabilities();

  // Fetch search results
  const filters = getFilters();
  const { data: searchResults, isLoading: searchLoading } = useSearchResults(filters);

  // Toggle level expansion
  const toggleLevel = (_level: string) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(_level)) {
        next.delete(_level);
      } else {
        next.add(_level);
      }
      return next;
    });
  };

  // Handle filter change
  const handleFilterChange = (_level: string, value: string | null, setter: (v: string | null) => void) => {
    setter(value);
    setPage(1);
    if (onSearch) {
      onSearch(getFilters());
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    resetAllFilters();
    setTextSearch('');
    setResultCount(0);
    if (onSearch) {
      onSearch({});
    }
  };

  // Handle apply filters
  const handleApplyFilters = () => {
    if (onSearch) {
      onSearch(getFilters());
    }
    setResultCount(searchResults?.pagination.totalCount || 0);
  };

  // Get selected value helper
  const getSelectedValue = (
    value: string | null,
    items: any[]
  ) => {
    if (!value) return { label: 'Не выбрано', count: 0 };
    const item = items.find((i) => i.id === value);
    return {
      label: item?.name || 'Не выбрано',
      count: item?.userCount || 0,
    };
  };

  // Loading skeleton
  if ((fieldsLoading || professionsLoading || servicesLoading || genresLoading || 
    workFormatsLoading || employmentTypesLoading || skillLevelsLoading || availabilitiesLoading || searchLoading) && !fields) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-primary-400" />
          <h3 className="text-lg font-bold text-white">Фильтры поиска</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-slate-700/50 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  const filterComponents = [
    {
      key: 'field',
      label: LEVEL_LABELS.field,
      value: fieldId,
      items: fields || [],
      loading: fieldsLoading,
      setter: setFieldId,
      resetDownstream: () => {
        setProfessionId(null);
        setServiceId(null);
        setGenreId(null);
      },
    },
    {
      key: 'profession',
      label: LEVEL_LABELS.profession,
      value: professionId,
      items: professions || [],
      loading: professionsLoading,
      setter: setProfessionId,
      resetDownstream: () => {
        setServiceId(null);
        setGenreId(null);
      },
      dependsOn: fieldId,
    },
    {
      key: 'service',
      label: LEVEL_LABELS.service,
      value: serviceId,
      items: services || [],
      loading: servicesLoading,
      setter: setServiceId,
      resetDownstream: () => setGenreId(null),
      dependsOn: professionId,
    },
    {
      key: 'genre',
      label: LEVEL_LABELS.genre,
      value: genreId,
      items: genres || [],
      loading: genresLoading,
      setter: setGenreId,
      dependsOn: serviceId,
    },
    {
      key: 'workFormat',
      label: LEVEL_LABELS.workFormat,
      value: workFormatId,
      items: workFormats || [],
      loading: workFormatsLoading,
      setter: setWorkFormatId,
    },
    {
      key: 'employmentType',
      label: LEVEL_LABELS.employmentType,
      value: employmentTypeId,
      items: employmentTypes || [],
      loading: employmentTypesLoading,
      setter: setEmploymentTypeId,
    },
    {
      key: 'skillLevel',
      label: LEVEL_LABELS.skillLevel,
      value: skillLevelId,
      items: skillLevels || [],
      loading: skillLevelsLoading,
      setter: setSkillLevelId,
    },
    {
      key: 'availability',
      label: LEVEL_LABELS.availability,
      value: availabilityId,
      items: availabilities || [],
      loading: availabilitiesLoading,
      setter: setAvailabilityId,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-primary-400" />
          <h3 className="text-lg font-bold text-white">Фильтры поиска</h3>
        </div>
        <div className="flex items-center gap-2">
          {resultCount > 0 && (
            <span className="bg-primary-500 text-white text-sm px-3 py-1 rounded-full">
              {resultCount} найдено
            </span>
          )}
          <button
            onClick={handleClearAll}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Очистить
          </button>
        </div>
      </div>

      {/* Text Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          value={textSearch}
          onChange={(e) => setTextSearch(e.target.value)}
          placeholder="Поиск по имени, никнейму..."
          className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
        />
      </div>

      {/* Filter Levels */}
      <div className="space-y-3">
        {filterComponents.map((filter) => {
          const isExpanded = expandedLevels.has(filter.key);
          const isDisabled = filter.dependsOn && !filter.dependsOn;
          const selectedInfo = getSelectedValue(filter.value, filter.items);

          if (compact && !filter.value && !isExpanded) {
            return null;
          }

          return (
            <div key={filter.key} className="relative">
              {/* Dropdown Trigger */}
              <button
                onClick={() => toggleLevel(filter.key)}
                disabled={!!isDisabled}
                className={`w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-left transition-all ${
                  isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-600/50'
                } ${filter.value ? 'border-primary-500/50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-sm">{filter.label}:</span>
                  <span className="text-white font-medium">
                    {filter.loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Загрузка...
                      </span>
                    ) : (
                      selectedInfo.label
                    )}
                  </span>
                  {selectedInfo.count > 0 && (
                    <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">
                      {selectedInfo.count}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={18}
                  className={`text-slate-400 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Options */}
              {isExpanded && (
                <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  {/* Clear option */}
                  <button
                    onClick={() => {
                      handleFilterChange(filter.key, null, (v) => {
                        filter.setter(v);
                        filter.resetDownstream?.();
                      });
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-700/50 transition-colors ${
                      !filter.value ? 'bg-primary-500/20 text-primary-400' : 'text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <X size={14} />
                      Не выбрано
                    </span>
                  </button>

                  {/* Options */}
                  {filter.items.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() =>
                        handleFilterChange(filter.key, item.id, (v) => {
                          filter.setter(v);
                          filter.resetDownstream?.();
                        })
                      }
                      className={`w-full px-4 py-3 text-left hover:bg-slate-700/50 transition-colors flex items-center justify-between ${
                        filter.value === item.id
                          ? 'bg-primary-500/20 text-primary-400'
                          : 'text-slate-300'
                      }`}
                    >
                      <span>{item.name}</span>
                      {item.userCount !== undefined && (
                        <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">
                          {item.userCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Loading state for button */}
      {(fieldsLoading || professionsLoading || servicesLoading || genresLoading || 
        workFormatsLoading || employmentTypesLoading || skillLevelsLoading || availabilitiesLoading || searchLoading) && (
        <div className="absolute inset-0 bg-slate-800/50 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-primary-400" />
        </div>
      )}

      {/* Apply Button */}
      <button
        onClick={handleApplyFilters}
        disabled={fieldsLoading || professionsLoading || servicesLoading || genresLoading || 
          workFormatsLoading || employmentTypesLoading || skillLevelsLoading || availabilitiesLoading || searchLoading}
        className="w-full mt-4 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {(fieldsLoading || professionsLoading || servicesLoading || genresLoading || 
          workFormatsLoading || employmentTypesLoading || skillLevelsLoading || availabilitiesLoading || searchLoading) ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Поиск...
          </>
        ) : (
          <>
            <Search size={18} />
            Применить фильтры
          </>
        )}
      </button>

      {/* Result Count */}
      {searchResults && searchResults.results.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Users size={16} />
            <span>
              Найдено {searchResults.pagination.totalCount} музыкантов
              {searchResults.pagination.totalPages > 1 &&
                ` (страница ${searchResults.pagination.page} из ${searchResults.pagination.totalPages})`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
