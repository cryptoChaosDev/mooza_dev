import { create } from 'zustand';
import { referenceAPI, SearchFilters, SearchResponse } from '../lib/api';
import { useQuery } from '@tanstack/react-query';

// Reference data types
export interface FieldOfActivity {
  id: string;
  name: string;
  userCount?: number;
}

export interface Profession {
  id: string;
  name: string;
  fieldOfActivityId: string;
  fieldOfActivity?: {
    id: string;
    name: string;
  };
}

export interface Service {
  id: string;
  name: string;
  nameEn?: string;
  professionId: string;
  professionName?: string;
  sortOrder: number;
  userCount?: number;
}

export interface Genre {
  id: string;
  name: string;
  nameEn?: string;
  serviceId: string;
  serviceName?: string;
  userCount?: number;
}

export interface WorkFormat {
  id: string;
  name: string;
  nameEn?: string;
  sortOrder: number;
  userCount?: number;
}

export interface EmploymentType {
  id: string;
  name: string;
  nameEn?: string;
  sortOrder: number;
  userCount?: number;
}

export interface SkillLevel {
  id: string;
  name: string;
  nameEn?: string;
  sortOrder: number;
  userCount?: number;
}

export interface Availability {
  id: string;
  name: string;
  nameEn?: string;
  sortOrder: number;
  userCount?: number;
}

// Filter state interface
interface SearchFilterState {
  // Level 1: Field of Activity
  fieldId: string | null;
  
  // Level 2: Profession
  professionId: string | null;
  
  // Level 3: Service
  serviceId: string | null;
  
  // Level 4: Genre
  genreId: string | null;
  
  // Level 5: Work Format
  workFormatId: string | null;
  
  // Level 6: Employment Type
  employmentTypeId: string | null;
  
  // Level 7: Skill Level
  skillLevelId: string | null;
  
  // Level 8: Availability
  availabilityId: string | null;
  
  // Pagination
  page: number;
  limit: number;
  
  // Result count (for display)
  resultCount: number;
  isLoading: boolean;
}

// Actions interface
interface SearchFilterActions {
  // Setters for each filter level
  setFieldId: (id: string | null) => void;
  setProfessionId: (id: string | null) => void;
  setServiceId: (id: string | null) => void;
  setGenreId: (id: string | null) => void;
  setWorkFormatId: (id: string | null) => void;
  setEmploymentTypeId: (id: string | null) => void;
  setSkillLevelId: (id: string | null) => void;
  setAvailabilityId: (id: string | null) => void;
  
  // Pagination
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  
  // Reset functions
  resetField: () => void;
  resetProfession: () => void;
  resetService: () => void;
  resetGenre: () => void;
  resetAllFilters: () => void;
  
  // Set result state
  setResultCount: (count: number) => void;
  setIsLoading: (loading: boolean) => void;
  
  // Get current filters
  getFilters: () => SearchFilters;
}

// Combined store interface
interface SearchStore extends SearchFilterState, SearchFilterActions {}

const initialState: SearchFilterState = {
  fieldId: null,
  professionId: null,
  serviceId: null,
  genreId: null,
  workFormatId: null,
  employmentTypeId: null,
  skillLevelId: null,
  availabilityId: null,
  page: 1,
  limit: 20,
  resultCount: 0,
  isLoading: false,
};

export const useSearchStore = create<SearchStore>((set, get) => ({
  ...initialState,

  // Setters with auto-reset of downstream filters
  setFieldId: (id) => {
    set((state) => ({
      fieldId: id,
      // Reset downstream filters when field changes
      professionId: state.professionId && state.fieldId !== id ? null : state.professionId,
      serviceId: state.serviceId,
      genreId: null,
    }));
  },

  setProfessionId: (id) => {
    set((state) => ({
      professionId: id,
      // Reset downstream filters when profession changes
      serviceId: state.serviceId && state.professionId !== id ? null : state.serviceId,
      genreId: null,
    }));
  },

  setServiceId: (id) => {
    set((state) => ({
      serviceId: id,
      // Reset downstream filter when service changes
      genreId: state.genreId && state.serviceId !== id ? null : state.genreId,
    }));
  },

  setGenreId: (id) => set({ genreId: id }),
  setWorkFormatId: (id) => set({ workFormatId: id }),
  setEmploymentTypeId: (id) => set({ employmentTypeId: id }),
  setSkillLevelId: (id) => set({ skillLevelId: id }),
  setAvailabilityId: (id) => set({ availabilityId: id }),

  // Pagination
  setPage: (page) => set({ page }),
  nextPage: () => set((state) => ({ page: state.page + 1 })),
  prevPage: () => set((state) => ({ page: Math.max(1, state.page - 1) })),

  // Reset functions
  resetField: () => set({ fieldId: null, professionId: null, serviceId: null, genreId: null }),
  resetProfession: () => set({ professionId: null, serviceId: null, genreId: null }),
  resetService: () => set({ serviceId: null, genreId: null }),
  resetGenre: () => set({ genreId: null }),
  
  resetAllFilters: () => set({
    fieldId: null,
    professionId: null,
    serviceId: null,
    genreId: null,
    workFormatId: null,
    employmentTypeId: null,
    skillLevelId: null,
    availabilityId: null,
    page: 1,
    resultCount: 0,
  }),

  // Set result state
  setResultCount: (count) => set({ resultCount: count }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  // Get current filters
  getFilters: () => {
    const state = get();
    return {
      fieldId: state.fieldId || undefined,
      professionId: state.professionId || undefined,
      serviceId: state.serviceId || undefined,
      genreId: state.genreId || undefined,
      workFormatId: state.workFormatId || undefined,
      employmentTypeId: state.employmentTypeId || undefined,
      skillLevelId: state.skillLevelId || undefined,
      availabilityId: state.availabilityId || undefined,
      page: state.page,
      limit: state.limit,
    };
  },
}));

// Custom hooks for fetching reference data
export function useFieldsOfActivity() {
  return useQuery({
    queryKey: ['fieldsOfActivity'],
    queryFn: async () => {
      const { data } = await referenceAPI.getFieldsOfActivity();
      return data as FieldOfActivity[];
    },
  });
}

export function useProfessions(fieldOfActivityId?: string) {
  return useQuery({
    queryKey: ['professions', fieldOfActivityId],
    queryFn: async () => {
      const { data } = await referenceAPI.getProfessions({ fieldOfActivityId });
      return data as Profession[];
    },
    enabled: !!fieldOfActivityId,
  });
}

export function useServices(professionId?: string, fieldOfActivityId?: string) {
  return useQuery({
    queryKey: ['services', professionId, fieldOfActivityId],
    queryFn: async () => {
      const { data } = await referenceAPI.getServices({ professionId, fieldOfActivityId });
      return data as Service[];
    },
    enabled: !!(professionId || fieldOfActivityId),
  });
}

export function useGenres(serviceId?: string) {
  return useQuery({
    queryKey: ['genres', serviceId],
    queryFn: async () => {
      const { data } = await referenceAPI.getGenres({ serviceId });
      return data as Genre[];
    },
    enabled: !!serviceId,
  });
}

export function useWorkFormats() {
  return useQuery({
    queryKey: ['workFormats'],
    queryFn: async () => {
      const { data } = await referenceAPI.getWorkFormats();
      return data as WorkFormat[];
    },
  });
}

export function useEmploymentTypes() {
  return useQuery({
    queryKey: ['employmentTypes'],
    queryFn: async () => {
      const { data } = await referenceAPI.getEmploymentTypes();
      return data as EmploymentType[];
    },
  });
}

export function useSkillLevels() {
  return useQuery({
    queryKey: ['skillLevels'],
    queryFn: async () => {
      const { data } = await referenceAPI.getSkillLevels();
      return data as SkillLevel[];
    },
  });
}

export function useAvailabilities() {
  return useQuery({
    queryKey: ['availabilities'],
    queryFn: async () => {
      const { data } = await referenceAPI.getAvailabilities();
      return data as Availability[];
    },
  });
}

// Hook for search results
export function useSearchResults(filters: SearchFilters) {
  return useQuery({
    queryKey: ['searchResults', filters],
    queryFn: async () => {
      const { data } = await referenceAPI.searchMusicians(filters);
      return data as SearchResponse;
    },
    // Always enabled — show results even when no filters are selected
    enabled: true,
  });
}
