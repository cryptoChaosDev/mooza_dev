import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    phone?: string;
    country?: string;
    city?: string;
    fieldOfActivityId?: string;
    userProfessions?: { professionId: string; features?: string[] }[];
    artistIds?: string[];
    employerId?: string;
  }) => api.post('/auth/register', data),
};

// User API
export const userAPI = {
  getMe: () => api.get('/users/me'),
  updateMe: (data: any) => api.put('/users/me', data),
  updateSearchProfile: (data: {
    serviceId?: string;
    genreId?: string;
    workFormatId?: string;
    employmentTypeId?: string;
    skillLevelId?: string;
    availabilityId?: string;
    pricePerHour?: number;
    pricePerEvent?: number;
  }) => api.put('/users/me/search-profile', data),
  uploadAvatar: (formData: FormData) =>
    api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  search: (params: any) => api.get('/users/search', { params }),
  getUser: (id: string) => api.get(`/users/${id}`),
};

// Reference API
export const referenceAPI = {
  getFieldsOfActivity: () => api.get('/references/fields-of-activity'),
  getProfessions: (params?: { fieldOfActivityId?: string; search?: string }) =>
    api.get('/references/professions', { params }),
  getProfessionFeatures: () => api.get('/references/profession-features'),
  getArtists: (params?: { search?: string }) =>
    api.get('/references/artists', { params }),
  getEmployers: (params?: { search?: string }) =>
    api.get('/references/employers', { params }),
  // Multi-level search endpoints
  getServices: (params?: { professionId?: string; fieldOfActivityId?: string }) =>
    api.get('/references/services', { params }),
  getGenres: (params?: { serviceId?: string }) =>
    api.get('/references/genres', { params }),
  getWorkFormats: () => api.get('/references/work-formats'),
  getEmploymentTypes: () => api.get('/references/employment-types'),
  getSkillLevels: () => api.get('/references/skill-levels'),
  getAvailabilities: () => api.get('/references/availabilities'),
  getAllReferences: () => api.get('/references/all'),
  searchMusicians: (params: {
    fieldId?: string;
    professionId?: string;
    serviceId?: string;
    genreId?: string;
    workFormatId?: string;
    employmentTypeId?: string;
    skillLevelId?: string;
    availabilityId?: string;
    query?: string;
    page?: number;
    limit?: number;
  }) => api.get('/references/search', { params }),
};

// Post API
export const postAPI = {
  getFeed: (params?: { limit?: number; offset?: number }) =>
    api.get('/posts/feed', { params }),
  createPost: (data: { content: string; imageUrl?: string }) =>
    api.post('/posts', data),
  likePost: (postId: string) => api.post(`/posts/${postId}/like`),
  unlikePost: (postId: string) => api.delete(`/posts/${postId}/like`),
  commentPost: (postId: string, content: string) =>
    api.post(`/posts/${postId}/comments`, { content }),
};

// Friendship API
export const friendshipAPI = {
  sendRequest: (receiverId: string) =>
    api.post('/friendships', { receiverId }),
  getRequests: () => api.get('/friendships/requests'),
  acceptRequest: (id: string) => api.put(`/friendships/${id}/accept`),
  rejectRequest: (id: string) => api.delete(`/friendships/${id}`),
  getFriends: () => api.get('/friendships'),
};

// Message API
export const messageAPI = {
  getConversations: () => api.get('/messages/conversations'),
  getMessages: (userId: string) => api.get(`/messages/${userId}`),
  sendMessage: (receiverId: string, content: string) =>
    api.post('/messages', { receiverId, content }),
  getUnreadCount: () => api.get('/messages/unread/count'),
};

// Search Filters Type
export interface SearchFilters {
  fieldId?: string;
  professionId?: string;
  serviceId?: string;
  genreId?: string;
  workFormatId?: string;
  employmentTypeId?: string;
  skillLevelId?: string;
  availabilityId?: string;
  query?: string;
  page?: number;
  limit?: number;
}

// Search Result Types
export interface SearchResult {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    avatar?: string;
    city?: string;
    fieldOfActivity?: {
      id: string;
      name: string;
    };
  };
  searchProfile: {
    service?: {
      id: string;
      name: string;
    };
    genre?: {
      id: string;
      name: string;
    };
    workFormat?: {
      id: string;
      name: string;
    };
    employmentType?: {
      id: string;
      name: string;
    };
    skillLevel?: {
      id: string;
      name: string;
    };
    availability?: {
      id: string;
      name: string;
    };
    pricePerHour?: number;
    pricePerEvent?: number;
  };
}

export interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  facets: {
    fields: Array<{ id: string; name: string; count: number }>;
    professions: Array<{
      id: string;
      name: string;
      professionId: string;
      professionName: string;
      fieldOfActivityId: string;
      fieldOfActivityName: string;
      count: number;
    }>;
    services: Array<{ id: string; count: number }>;
    genres: Array<{ id: string; count: number }>;
  };
}
