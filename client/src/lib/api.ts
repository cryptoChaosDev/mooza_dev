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
  updateServices: (services: Array<{
    professionId: string;
    serviceId: string;
    genreIds?: string[];
    workFormatIds?: string[];
    employmentTypeIds?: string[];
    skillLevelIds?: string[];
    availabilityIds?: string[];
    priceRangeIds?: string[];
    geographyIds?: string[];
  }>) => api.put('/users/me/services', services),
  uploadAvatar: (formData: FormData) =>
    api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadBanner: (formData: FormData) =>
    api.post('/users/me/banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  search: (params: any) => api.get('/users/search', { params }),
  getUser: (id: string) => api.get(`/users/${id}`),
  uploadPortfolio: (formData: FormData) =>
    api.post('/users/me/portfolio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deletePortfolioFile: (fileId: string) => api.delete(`/users/me/portfolio/${fileId}`),
};

// Reference API
export const referenceAPI = {
  getFieldsOfActivity: () => api.get('/references/fields-of-activity'),
  getDirections: (params?: { fieldOfActivityId?: string }) =>
    api.get('/references/directions', { params }),
  getProfessions: (params?: { directionId?: string; search?: string }) =>
    api.get('/references/professions', { params }),
  getProfessionFeatures: () => api.get('/references/profession-features'),
  getArtists: (params?: { search?: string }) =>
    api.get('/references/artists', { params }),
  getEmployers: (params?: { search?: string }) =>
    api.get('/references/employers', { params }),
  // Multi-level search endpoints
  getServices: (params?: { professionId?: string; fieldOfActivityId?: string }) =>
    api.get('/references/services', { params }),
  getGenres: () => api.get('/references/genres'),
  getWorkFormats: () => api.get('/references/work-formats'),
  getEmploymentTypes: () => api.get('/references/employment-types'),
  getSkillLevels: () => api.get('/references/skill-levels'),
  getAvailabilities: () => api.get('/references/availabilities'),
  getGeographies: () => api.get('/references/geographies'),
  getPriceRanges: () => api.get('/references/price-ranges'),
  getAllReferences: () => api.get('/references/all'),
  searchMusicians: (params: {
    fieldId?: string;
    directionId?: string;
    professionId?: string;
    serviceId?: string;
    genreId?: string;
    workFormatId?: string;
    employmentTypeId?: string;
    skillLevelId?: string;
    availabilityId?: string;
    geographyId?: string;
    priceRangeId?: string;
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
  getSentRequests: () => api.get('/friendships/sent'),
  acceptRequest: (id: string) => api.put(`/friendships/${id}/accept`),
  rejectRequest: (id: string) => api.delete(`/friendships/${id}`),
  removeFriend: (friendshipId: string) => api.delete(`/friendships/${friendshipId}`),
  getFriends: () => api.get('/friendships'),
};

// Message API
export const messageAPI = {
  getUnreadCount: () => api.get('/messages/unread/count'),
  getConversations: () => api.get('/messages/conversations'),
  resolve: (id: string) => api.get(`/messages/resolve/${id}`),
  getConversation: (conversationId: string) => api.get(`/messages/conversations/${conversationId}`),
  sendMessage: (conversationId: string, content: string, replyToId?: string) =>
    api.post(`/messages/conversations/${conversationId}/messages`, { content, replyToId }),
  editMessage: (messageId: string, content: string) =>
    api.patch(`/messages/messages/${messageId}`, { content }),
  deleteMessage: (messageId: string) => api.delete(`/messages/messages/${messageId}`),
  markRead: (conversationId: string) => api.patch(`/messages/conversations/${conversationId}/read`),
  createGroup: (name: string, memberIds: string[]) =>
    api.post('/messages/conversations/group', { name, memberIds }),
  deleteConversation: (conversationId: string) =>
    api.delete(`/messages/conversations/${conversationId}`),
  addMember: (conversationId: string, memberId: string) =>
    api.post(`/messages/conversations/${conversationId}/members`, { memberId }),
  removeMember: (conversationId: string, memberId: string) =>
    api.delete(`/messages/conversations/${conversationId}/members/${memberId}`),
};

// Admin API
const adminBase = '/admin';
const crudFor = (path: string) => ({
  list: () => api.get(`${adminBase}/${path}`),
  create: (data: any) => api.post(`${adminBase}/${path}`, data),
  update: (id: string, data: any) => api.put(`${adminBase}/${path}/${id}`, data),
  remove: (id: string) => api.delete(`${adminBase}/${path}/${id}`),
});
export const adminAPI = {
  fieldsOfActivity: crudFor('fields-of-activity'),
  directions: crudFor('directions'),
  professions: crudFor('professions'),
  services: crudFor('services'),
  genres: crudFor('genres'),
  workFormats: crudFor('work-formats'),
  employmentTypes: crudFor('employment-types'),
  skillLevels: crudFor('skill-levels'),
  availabilities: crudFor('availabilities'),
  geographies: crudFor('geographies'),
  priceRanges: crudFor('price-ranges'),
  artists: crudFor('artists'),
  employers: crudFor('employers'),
};

// Search Filters Type
export interface SearchFilters {
  fieldId?: string;
  directionId?: string;
  professionId?: string;
  serviceId?: string;
  genreId?: string;
  workFormatId?: string;
  employmentTypeId?: string;
  skillLevelId?: string;
  availabilityId?: string;
  geographyId?: string;
  priceRangeId?: string;
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
    fieldOfActivity?: { id: string; name: string };
    userProfessions?: { id: string; profession: { id: string; name: string } }[];
  };
  searchProfile: {
    services: { id: string; name: string }[];
    genres: { id: string; name: string }[];
    workFormats: { id: string; name: string }[];
    employmentTypes: { id: string; name: string }[];
    skillLevels: { id: string; name: string }[];
    availabilities: { id: string; name: string }[];
    geographies: { id: string; name: string }[];
    priceRanges: { id: string; name: string }[];
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
}
