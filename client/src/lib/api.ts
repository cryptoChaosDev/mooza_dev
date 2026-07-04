import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

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

// Auto-logout on 401 (expired or invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  telegramLogin: (data: Record<string, string | number>) =>
    api.post('/auth/telegram', data),
  telegramMiniApp: (initData: string) =>
    api.post('/auth/telegram/miniapp', { initData }),
  checkNickname: (nickname: string) =>
    api.get('/auth/check-nickname', { params: { nickname } }),
  checkEmail: (email: string) =>
    api.get('/auth/check-email', { params: { email } }),
  telegramToken: () => api.post('/auth/telegram/token'),
  telegramPoll: (token: string) => api.get(`/auth/telegram/poll/${token}`),
  vkToken: (accessToken: string) =>
    api.post('/auth/vk/token', { access_token: accessToken }),
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
  }) => api.post('/auth/register', data),
  verifyEmail: (email: string, code: string) =>
    api.post('/auth/verify-email', { email, code }),
  resendVerification: (email: string) =>
    api.post('/auth/resend-verification', { email }),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (email: string, code: string, password: string) =>
    api.post('/auth/reset-password', { email, code, password }),
};

// User API
export const userAPI = {
  getMe: () => api.get('/users/me'),
  updateMe: (data: any) => api.put('/users/me', data),
  givePublicConsent: () => api.post('/users/me/public-consent'),
  updateServices: (services: Array<{
    professionId: string;
    serviceId: string;
    name?: string;
    genreIds?: string[];
    workFormatIds?: string[];
    employmentTypeIds?: string[];
    skillLevelIds?: string[];
    availabilityIds?: string[];
    geographyIds?: string[];
    priceFrom?: number;
    priceTo?: number;
    deadlineFrom?: number;
    deadlineTo?: number;
    description?: string;
    customFilterValueIds?: string[];
    status?: string;
    priceItems?: Array<{name: string; price: string; from?: boolean}>;
  }>) => api.put('/users/me/services', services),
  getUserService: (serviceId: string) => api.get(`/users/user-service/${serviceId}`),
  patchUserService: (serviceId: string, data: {
    name?: string; priceFrom?: number | null; priceTo?: number | null;
    deadlineFrom?: number | null; deadlineTo?: number | null; description?: string;
    priceItems?: Array<{name: string; price: string; from?: boolean}> | null;
  }) => api.patch(`/users/me/services/${serviceId}`, data),
  setServiceStatus: (serviceId: string, status: 'active' | 'draft' | 'archived' | 'pending_review') =>
    api.patch(`/users/me/services/${serviceId}/status`, { status }),
  deleteService: (serviceId: string) =>
    api.delete(`/users/me/services/${serviceId}`),
  inquireService: (serviceId: string) =>
    api.post(`/users/services/${serviceId}/inquire`),
  uploadAvatar: (formData: FormData) =>
    api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadBanner: (formData: FormData) =>
    api.post('/users/me/banner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  search: (params: any) => api.get('/users/search', { params }),
  catalog: (params?: {
    query?: string;
    fieldOfActivityId?: string;
    directionId?: string;
    professionId?: string;
    customFilterValueIds?: string;
    // People-tab filters/sort
    location?: string;       // comma-separated city/country names
    profession?: string;     // comma-separated profession ids
    occupancy?: string;      // comma-separated: open|considering|closed
    sort?: 'date' | 'rating' | 'connections' | 'alpha';
    alphaDir?: 'asc' | 'desc';
  }) =>
    api.get('/users/catalog', { params }),
  getUser: (id: string) => api.get(`/users/${id}`),
  getUserServices: (id: string) => api.get(`/users/${id}/services`),
  uploadPortfolio: (formData: FormData) =>
    api.post('/users/me/portfolio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deletePortfolioFile: (fileId: string) => api.delete(`/users/me/portfolio/${fileId}`),
  renamePortfolioFile: (fileId: string, title: string) => api.patch(`/users/me/portfolio/${fileId}`, { title }),
  reorderPortfolio: (orderedIds: string[]) => api.patch('/users/me/portfolio/reorder', { orderedIds }),
  addPortfolioLink: (data: { type: string; url: string; title?: string }) => api.post('/users/me/portfolio/links', data),
  deletePortfolioLink: (linkId: string) => api.delete(`/users/me/portfolio/links/${linkId}`),
  agreeToTerms: () => api.post('/users/me/agree-terms'),
  completeOnboarding: () => api.patch('/users/me/complete-onboarding'),
};

// Reference API
export const referenceAPI = {
  getFieldsOfActivity: (params?: { excludeUserId?: string; all?: boolean }) => api.get('/references/fields-of-activity', { params }),
  getDirections: (params?: { fieldOfActivityId?: string; excludeUserId?: string; all?: boolean }) =>
    api.get('/references/directions', { params }),
  getProfessions: (params?: { directionId?: string; search?: string; excludeUserId?: string; all?: boolean }) =>
    api.get('/references/professions', { params }),
  getProfessionFeatures: () => api.get('/references/profession-features'),
  getArtists: (params?: { search?: string; type?: string; genre?: string; sort?: 'date' | 'alpha' }) =>
    api.get('/references/artists', { params }),
  // Multi-level search endpoints
  getServices: (params?: { directionId?: string; professionId?: string; fieldOfActivityId?: string }) =>
    api.get('/references/services', { params }),
  searchServices: (q: string) => api.get('/references/services/search', { params: { q } }),
  getGenres: () => api.get('/references/genres'),
  getWorkFormats: () => api.get('/references/work-formats'),
  getEmploymentTypes: () => api.get('/references/employment-types'),
  getSkillLevels: () => api.get('/references/skill-levels'),
  getAvailabilities: () => api.get('/references/availabilities'),
  getGeographies: () => api.get('/references/geographies'),
  getCities: () => api.get('/references/cities'),
  getPriceRanges: () => api.get('/references/price-ranges'),
  getAllReferences: () => api.get('/references/all'),
  getProfessionFilters: (professionId: string) => api.get(`/references/professions/${professionId}/filters`),
  // New catalog (sections → services → service filters)
  getSections: () => api.get('/references/sections'),
  // Service-card search — finds service offerings (UserService), not people.
  searchServiceCards: (params: {
    serviceId?: string;
    sectionId?: string;
    customFilterValueIds?: string;
    query?: string;
    location?: string;
    priceMin?: number;
    priceMax?: number;
    sort?: 'date' | 'price_asc' | 'price_desc' | 'rating';
    page?: number;
    limit?: number;
  }) =>
    api.get('/references/service-search', { params }),
  // Distinct provider cities (for the location filter autocomplete).
  getServiceCities: (q?: string) => api.get('/references/service-cities', { params: { q } }),
  // Distinct user cities + countries (People-tab location filter autocomplete).
  getPeopleLocations: (q?: string) => api.get('/references/people-locations', { params: { q } }),
  getServiceDetail: (serviceId: string) => api.get(`/references/services/${serviceId}`),
  getServiceFilters: (serviceId: string) => api.get(`/references/services/${serviceId}/filters`),
  searchMusicians: (params: {
    fieldId?: string;
    directionId?: string;
    professionId?: string;
    serviceId?: string;
    customFilterValueIds?: string;
    genreId?: string;
    workFormatId?: string;
    employmentTypeId?: string;
    skillLevelId?: string;
    availabilityId?: string;
    geographyId?: string;
    priceMin?: string;
    priceMax?: string;
    query?: string;
    page?: number;
    limit?: number;
  }) => api.get('/references/search', { params }),
};

// Role API — artist-profile role catalog (collective / release / clip)
export const roleAPI = {
  list: (context: 'collective' | 'release' | 'clip') =>
    api.get('/roles', { params: { context } }),
};

// Post API
export const postAPI = {
  getFeed: (params?: { limit?: number; offset?: number; type?: string; authorKind?: string; period?: string; city?: string; employment?: string; artistType?: string; genre?: string; sort?: string }) =>
    api.get('/posts/feed', { params }),
  getMyAuthors: () => api.get('/posts/my-authors'),
  createPost: (data: { content: string; type?: string; imageUrl?: string; audioUrl?: string; audioName?: string; channelId?: string | null; artistId?: string | null; employmentStatus?: string; pollOptions?: string[]; pollEndsAt?: string; images?: string[]; tags?: string[]; genres?: string[]; links?: string[]; city?: string | null; mentions?: Array<{ id: string; type: string; name: string }>; title?: string; category?: string; serviceId?: string }) =>
    api.post('/posts', data),
  repostPost: (postId: string, comment?: string) =>
    api.post(`/posts/${postId}/repost`, { comment }),
  votePoll: (postId: string, optionIndex: number) =>
    api.post(`/posts/${postId}/vote`, { optionIndex }),
  toggleSave: (postId: string) => api.post(`/posts/${postId}/save`),
  getSavedPosts: () => api.get('/posts/saved/list'),
  uploadMedia: (formData: FormData) =>
    api.post('/posts/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  likePost: (postId: string) => api.post(`/posts/${postId}/like`),
  unlikePost: (postId: string) => api.delete(`/posts/${postId}/like`),
  commentPost: (postId: string, content: string, parentCommentId?: string) =>
    api.post(`/posts/${postId}/comments`, { content, ...(parentCommentId ? { parentCommentId } : {}) }),
  editPost: (postId: string, data: { content?: string; imageUrl?: string | null; audioUrl?: string | null; audioName?: string | null }) =>
    api.put(`/posts/${postId}`, data),
  deletePost: (postId: string) => api.delete(`/posts/${postId}`),
  editComment: (postId: string, commentId: string, content: string) =>
    api.put(`/posts/${postId}/comments/${commentId}`, { content }),
  deleteComment: (postId: string, commentId: string) => api.delete(`/posts/${postId}/comments/${commentId}`),
  reactPost: (postId: string, emoji: string) => api.post(`/posts/${postId}/reactions`, { emoji }),
  unreactPost: (postId: string) => api.delete(`/posts/${postId}/reactions`),
  reactComment: (postId: string, commentId: string, emoji: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/reactions`, { emoji }),
  unreactComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}/reactions`),
};

// Channel API
export const channelAPI = {
  getMyChannel: () => api.get('/channels/my'),
  createChannel: (data: { name: string; description?: string }) => api.post('/channels', data),
  updateChannel: (data: { name?: string; description?: string }) => api.put('/channels/my', data),
  deleteChannel: () => api.delete('/channels/my'),
  uploadAvatar: (formData: FormData) =>
    api.post('/channels/my/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getChannel: (id: string) => api.get(`/channels/${id}`),
  subscribe: (id: string) => api.post(`/channels/${id}/subscribe`),
  unsubscribe: (id: string) => api.delete(`/channels/${id}/subscribe`),
  getChannelFeed: (params?: { limit?: number; offset?: number }) =>
    api.get('/channels/feed', { params }),
  getMyChannelFeed: (params?: { limit?: number; offset?: number }) =>
    api.get('/channels/feed/mine', { params }),
  getSubscribedFeed: (params?: { limit?: number; offset?: number }) =>
    api.get('/channels/feed/subscribed', { params }),
  getSubscriptions: () => api.get('/channels/subscriptions'),
  getMySubscribers: () => api.get('/channels/my/subscribers'),
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
  contactService: (userServiceId: string) =>
    api.post<{ conversationId: string }>(`/messages/services/${userServiceId}/contact`),
  getConversation: (conversationId: string) => api.get(`/messages/conversations/${conversationId}`),
  sendMessage: (conversationId: string, content: string, replyToId?: string, attachment?: { url: string; name: string; size: number; type: string }) =>
    api.post(`/messages/conversations/${conversationId}/messages`, {
      content,
      replyToId,
      ...(attachment ? { attachmentUrl: attachment.url, attachmentName: attachment.name, attachmentSize: attachment.size, attachmentType: attachment.type } : {}),
    }),
  uploadAttachment: (conversationId: string, formData: FormData) =>
    api.post(`/messages/conversations/${conversationId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  editMessage: (messageId: string, content: string) =>
    api.patch(`/messages/messages/${messageId}`, { content }),
  deleteMessage: (messageId: string) => api.delete(`/messages/messages/${messageId}`),
  reactMessage: (messageId: string, emoji: string) =>
    api.post(`/messages/messages/${messageId}/reactions`, { emoji }),
  unreactMessage: (messageId: string) =>
    api.delete(`/messages/messages/${messageId}/reactions`),
  markRead: (conversationId: string) => api.patch(`/messages/conversations/${conversationId}/read`),
  createGroup: (name: string, memberIds: string[]) =>
    api.post('/messages/conversations/group', { name, memberIds }),
  deleteConversation: (conversationId: string) =>
    api.delete(`/messages/conversations/${conversationId}`),
  addMember: (conversationId: string, memberId: string) =>
    api.post(`/messages/conversations/${conversationId}/members`, { memberId }),
  removeMember: (conversationId: string, memberId: string) =>
    api.delete(`/messages/conversations/${conversationId}/members/${memberId}`),
  togglePin: (conversationId: string) => api.patch(`/messages/conversations/${conversationId}/pin`),
  toggleArchive: (conversationId: string) => api.patch(`/messages/conversations/${conversationId}/archive`),
  setType: (conversationId: string, type: 'personal' | 'business') => api.patch(`/messages/conversations/${conversationId}/type`, { type }),
  searchMessages: (conversationId: string, q: string) => api.get(`/messages/conversations/${conversationId}/search`, { params: { q } }),
  getAttachments: (conversationId: string) => api.get(`/messages/conversations/${conversationId}/attachments`),
};

// Artist API
export const artistAPI = {
  suggest: (q: string) => api.get('/artists/suggest', { params: { q } }),
  getArtist: (id: string) => api.get(`/artists/${id}`),
  createArtist: (data: any) => api.post('/artists', data),
  updateArtist: (id: string, data: any) => api.put(`/artists/${id}`, data),
  follow: (id: string) => api.post(`/artists/${id}/follow`),
  unfollow: (id: string) => api.delete(`/artists/${id}/follow`),
  getFollowing: () => api.get('/artists/following'),
  checkName: (name: string) => api.get('/artists/check-name', { params: { name } }),
  lookup: (q: string) => api.get('/artist-lookup', { params: { q } }),
  lookupAvatar: (url: string) => api.get('/artist-lookup/avatar', { params: { url }, responseType: 'blob' }),
  lookupReleases: (params: { itunesId?: number | null; deezerId?: number | null }) => api.get('/artist-lookup/releases', { params }),
  requestVerification: (id: string, verificationUrl: string) =>
    api.patch(`/artists/${id}/request-verification`, { verificationUrl }),
  withdrawVerification: (id: string) => api.patch(`/artists/${id}/withdraw`),
  uploadAvatar: (id: string, file: File) => {
    const fd = new FormData(); fd.append('avatar', file);
    return api.post(`/artists/${id}/avatar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadBanner: (id: string, file: File) => {
    const fd = new FormData(); fd.append('banner', file);
    return api.post(`/artists/${id}/banner`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  requestJoin: (artistId: string, roleIds: string[]) =>
    api.post(`/artists/${artistId}/join-request`, { roleIds }),
  pendingMemberships: (artistId: string) => api.get(`/artists/${artistId}/memberships/pending`),
  approveMembership: (id: string) => api.patch(`/artists/memberships/${id}/approve`),
  rejectMembership: (id: string) => api.patch(`/artists/memberships/${id}/reject`),
  // «Запросы» inboxes: invitations sent to me + join requests to artists I own.
  getMyInvites: () => api.get('/artists/my-invites'),
  getJoinRequests: () => api.get('/artists/join-requests'),

  // Phase 5a — members / admins / ownership / invite links
  addMember: (
    artistId: string,
    data: { userId: string; roleIds?: string[]; participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER' },
  ) => api.post(`/artists/${artistId}/members`, data),
  confirmMembership: (membershipId: string) =>
    api.patch(`/artists/memberships/${membershipId}/confirm`),
  declineMembership: (membershipId: string) =>
    api.patch(`/artists/memberships/${membershipId}/decline`),
  setMemberParticipation: (
    artistId: string,
    membershipId: string,
    participationStatus: 'ACTIVE_MEMBER' | 'FORMER_MEMBER',
  ) => api.patch(`/artists/${artistId}/members/${membershipId}/participation`, { participationStatus }),
  setMemberRoles: (artistId: string, membershipId: string, roleIds: string[]) =>
    api.patch(`/artists/${artistId}/members/${membershipId}/roles`, { roleIds }),
  removeMember: (artistId: string, membershipId: string) =>
    api.delete(`/artists/${artistId}/members/${membershipId}`),
  setActivityStatus: (
    artistId: string,
    activityStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DISBANDED',
  ) => api.patch(`/artists/${artistId}/activity-status`, { activityStatus }),
  transferOwner: (artistId: string, userId: string) =>
    api.patch(`/artists/${artistId}/transfer-owner`, { userId }),
  addAdmin: (artistId: string, userId: string) =>
    api.post(`/artists/${artistId}/admins`, { userId }),
  removeAdmin: (artistId: string, userId: string) =>
    api.delete(`/artists/${artistId}/admins/${userId}`),
  createInviteLink: (
    artistId: string,
    data: { roleIds?: string[]; participationStatus?: 'ACTIVE_MEMBER' | 'FORMER_MEMBER' },
  ) => api.post(`/artists/${artistId}/invite-link`, data),
  getInvite: (token: string) => api.get(`/artists/invite/${token}`),
  acceptInvite: (token: string) => api.post(`/artists/invite/${token}/accept`),
};

// Release API — Phase 6a (releases on the artist profile)
export const releaseAPI = {
  fetchMetadata: (platform: string, url: string) =>
    api.post('/releases/metadata', { platform, url }),
  create: (data: {
    artistId: string;
    platform: 'VK' | 'SPOTIFY' | 'YANDEX_MUSIC' | 'APPLE_MUSIC';
    url: string;
    title: string;
    coverUrl?: string;
    releaseDate?: string;
    participants: { userId: string; roleIds: string[] }[];
  }) => api.post('/releases', data),
  get: (id: string) => api.get(`/releases/${id}`),
  listByArtist: (artistId: string) => api.get(`/releases/artist/${artistId}`),
  update: (
    id: string,
    data: {
      title?: string;
      coverUrl?: string | null;
      releaseDate?: string | null;
      url?: string;
      platform?: 'VK' | 'SPOTIFY' | 'YANDEX_MUSIC' | 'APPLE_MUSIC';
      participants?: { userId: string; roleIds: string[] }[];
    },
  ) => api.patch(`/releases/${id}`, data),
  confirmParticipant: (participantId: string) =>
    api.patch(`/releases/participants/${participantId}/confirm`),
  declineParticipant: (participantId: string) =>
    api.patch(`/releases/participants/${participantId}/decline`),
  getPendingParticipations: () => api.get('/releases/participations/pending'),
  remove: (id: string) => api.delete(`/releases/${id}`),
};

// Clip API — Phase 6a (clips on the artist profile)
export const clipAPI = {
  fetchMetadata: (platform: string, url: string) =>
    api.post('/clips/metadata', { platform, url }),
  create: (data: {
    artistId: string;
    platform: 'VK_VIDEO' | 'RUTUBE' | 'YOUTUBE' | 'APPLE_MUSIC';
    url: string;
    title: string;
    coverUrl?: string;
    participants: { userId: string; roleIds: string[] }[];
  }) => api.post('/clips', data),
  get: (id: string) => api.get(`/clips/${id}`),
  listByArtist: (artistId: string) => api.get(`/clips/artist/${artistId}`),
  update: (
    id: string,
    data: {
      title?: string;
      coverUrl?: string | null;
      url?: string;
      platform?: 'VK_VIDEO' | 'RUTUBE' | 'YOUTUBE' | 'APPLE_MUSIC';
      participants?: { userId: string; roleIds: string[] }[];
    },
  ) => api.patch(`/clips/${id}`, data),
  confirmParticipant: (participantId: string) =>
    api.patch(`/clips/participants/${participantId}/confirm`),
  declineParticipant: (participantId: string) =>
    api.patch(`/clips/participants/${participantId}/decline`),
  getPendingParticipations: () => api.get('/clips/participations/pending'),
  remove: (id: string) => api.delete(`/clips/${id}`),
};

// Connection API
export const connectionAPI = {
  send: (receiverId: string, serviceIds: string[], requesterRole?: string, receiverRole?: string, needsDeal?: boolean) =>
    api.post('/connections', { receiverId, serviceIds, requesterRole, receiverRole, needsDeal }),
  getAccepted: () => api.get('/connections'),
  getRequests: () => api.get('/connections/requests'),
  getSent: () => api.get('/connections/sent'),
  getBreakRequests: () => api.get('/connections/break-requests'),
  getWith: (userId: string) => api.get(`/connections/with/${userId}`),
  getUserConnections: (userId: string) => api.get(`/connections/user/${userId}`),
  accept: (id: string) => api.patch(`/connections/${id}/accept`),
  reject: (id: string) => api.patch(`/connections/${id}/reject`),
  cancel: (id: string) => api.delete(`/connections/${id}`),
  requestBreak: (id: string, reason: string) => api.patch(`/connections/${id}/break`, { reason }),
  confirmBreak: (id: string, reason: string) => api.patch(`/connections/${id}/confirm-break`, { reason }),
  cancelBreak: (id: string) => api.patch(`/connections/${id}/cancel-break`),
  addServices: (id: string, serviceIds: string[]) => api.patch(`/connections/${id}/add-services`, { serviceIds }),
  getMyBreakRequests: () => api.get('/connections/my-break-requests'),
  getAll: () => api.get('/connections/all'),
  getRejected: () => api.get('/connections/rejected'),
  getHistory: () => api.get('/connections/history'),
};

export const groupAPI = {
  create: (data: { name: string; description?: string; city?: string; type?: string }) =>
    api.post('/groups', data),
  getMyGroups: () => api.get('/groups/my'),
  getInvites: () => api.get('/groups/invites'),
  getGroup: (id: string) => api.get(`/groups/${id}`),
  update: (id: string, data: object) => api.patch(`/groups/${id}`, data),
  submit: (id: string) => api.post(`/groups/${id}/submit`),
  invite: (id: string, friendId: string, professionId: string) =>
    api.post(`/groups/${id}/invite`, { friendId, professionId }),
  acceptInvite: (membershipId: string) => api.patch(`/groups/invites/${membershipId}/accept`),
  declineInvite: (membershipId: string) => api.patch(`/groups/invites/${membershipId}/decline`),
  removeMember: (groupId: string, membershipId: string) =>
    api.delete(`/groups/${groupId}/members/${membershipId}`),
  deleteGroup: (id: string) => api.delete(`/groups/${id}`),
  transferOwner: (groupId: string, newOwnerMembershipId: string) =>
    api.patch(`/groups/${groupId}/transfer-owner`, { newOwnerMembershipId }),
  leave: (groupId: string) => api.delete(`/groups/${groupId}/leave`),
};

export const favoriteAPI = {
  list: () => api.get('/favorites'),
  status: (targetId: string) => api.get(`/favorites/status/${targetId}`),
  add: (targetId: string) => api.post(`/favorites/${targetId}`),
  remove: (targetId: string) => api.delete(`/favorites/${targetId}`),
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
  directions: {
    ...crudFor('directions'),
    setFilters: (id: string, filterIds: string[], filterTypes: string[]) =>
      api.put(`${adminBase}/directions/${id}/filters`, { filterIds, filterTypes }),
    setServices: (id: string, serviceIds: string[]) =>
      api.put(`${adminBase}/directions/${id}/services`, { serviceIds }),
    setSphere: (id: string, fieldOfActivityId: string | null) =>
      api.put(`${adminBase}/directions/${id}`, { fieldOfActivityId }),
  },
  professions: {
    ...crudFor('professions'),
    setDirection: (id: string, directionId: string | null) =>
      api.put(`${adminBase}/professions/${id}`, { directionId }),
  },
  services: crudFor('services'),
  genres: crudFor('genres'),
  workFormats: crudFor('work-formats'),
  professionFeatures: crudFor('profession-features'),
  groups: crudFor('groups'),
  employmentTypes: crudFor('employment-types'),
  skillLevels: crudFor('skill-levels'),
  availabilities: crudFor('availabilities'),
  geographies: crudFor('geographies'),
  priceRanges: crudFor('price-ranges'),
  artists: crudFor('artists'),
  waitlist: {
    list: (type?: string) => api.get(`${adminBase}/waitlist`, { params: type ? { type } : undefined }),
  },
  artistModeration: {
    verification: () => api.get(`${adminBase}/artists/verification`),
    reject: (id: string, reason?: string) => api.patch(`${adminBase}/artists/${id}/reject`, { reason }),
    verify: (id: string) => api.patch(`${adminBase}/artists/${id}/verify`),
  },
  serviceModeration: {
    pending: () => api.get(`${adminBase}/user-services/pending`),
    approve: (id: string) => api.patch(`${adminBase}/user-services/${id}/approve`),
    reject: (id: string, reason?: string) => api.patch(`${adminBase}/user-services/${id}/reject`, { reason }),
  },
  customFilters: {
    list: () => api.get(`${adminBase}/custom-filters`),
    create: (data: { name: string; values: string[] }) => api.post(`${adminBase}/custom-filters`, data),
    update: (id: string, data: { name?: string; values?: string[] }) => api.put(`${adminBase}/custom-filters/${id}`, data),
    remove: (id: string) => api.delete(`${adminBase}/custom-filters/${id}`),
  },
  users: {
    deleteUser: (id: string) => api.delete(`${adminBase}/users/${id}`),
    verifyEmail: (id: string) => api.patch(`${adminBase}/users/${id}/verify-email`),
  },
  // Moooza Pro donations
  listDonations: (status?: string) =>
    api.get(`${adminBase}/donations`, { params: status ? { status } : undefined }),
  activateDonation: (id: string, body?: { amount?: number; note?: string }) =>
    api.post(`${adminBase}/donations/${id}/activate`, body ?? {}),
  grantProMonth: (userId: string) =>
    api.post(`${adminBase}/users/${userId}/grant-pro-month`),
};

// Moooza Pro API (user-facing donation flow)
export const proAPI = {
  startDonation: () => api.post('/pro/donation/start'),
  currentDonation: () => api.get('/pro/donation/current'),
};

// Feed preset API — server-persisted named feed-filter snapshots
export const feedPresetAPI = {
  list: () => api.get('/feed-presets'),
  create: (name: string, filters: Record<string, unknown>) =>
    api.post('/feed-presets', { name, filters }),
  update: (id: string, body: { name?: string; filters?: Record<string, unknown> }) =>
    api.put(`/feed-presets/${id}`, body),
  remove: (id: string) => api.delete(`/feed-presets/${id}`),
};

export const dealAPI = {
  getAll: (params?: { role?: string; status?: string }) => api.get('/deals', { params }),
  getOne: (id: string) => api.get(`/deals/${id}`),
  create: (data: {
    title: string; executorId: string; serviceId?: string; userServiceId?: string;
    price?: number; deadline?: string; acceptDeadline?: string; revisionCount?: number; result?: string;
    dealType?: 'process' | 'event'; eventDate?: string; deposit?: number;
  }) => api.post('/deals', data),
  accept: (id: string) => api.patch(`/deals/${id}/accept`),
  reject: (id: string, reason?: string) => api.patch(`/deals/${id}/reject`, { reason }),
  cancel: (id: string, reason?: string) => api.patch(`/deals/${id}/cancel`, { reason }),
  pay: (id: string) => api.patch(`/deals/${id}/pay`),
  submit: (id: string) => api.patch(`/deals/${id}/submit`),
  approve: (id: string) => api.patch(`/deals/${id}/approve`),
  revision: (id: string, comment?: string) => api.patch(`/deals/${id}/revision`, { comment }),
  confirm: (id: string) => api.patch(`/deals/${id}/confirm`),
  requestEdit: (id: string, data: { deadline?: string; acceptDeadline?: string; revisionCount?: number }) =>
    api.post(`/deals/${id}/edit-request`, data),
  acceptEdit: (reqId: string) => api.patch(`/deals/edit-request/${reqId}/accept`),
  rejectEdit: (reqId: string) => api.patch(`/deals/edit-request/${reqId}/reject`),
};

export const orderAPI = {
  getMine: (params?: { status?: string }) => api.get('/orders/mine', { params }),
  getOne: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  update: (id: string, data: any) => api.patch(`/orders/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/orders/${id}`),
  getMatches: (id: string, params?: { page?: number; limit?: number }) => api.get(`/orders/${id}/matches`, { params }),
  respond: (id: string, data: { price: number; comment?: string }) => api.post(`/orders/${id}/responses`, data),
  getResponses: (id: string) => api.get(`/orders/${id}/responses`),
  getIncomingResponses: () => api.get('/orders/responses/incoming'),
  offer: (id: string, executorId: string) => api.post(`/orders/${id}/offer`, { executorId }),
  createDeal: (id: string, responseId: string) => api.post(`/orders/${id}/responses/${responseId}/deal`, {}),
  uploadReferences: (id: string, formData: FormData) => api.post(`/orders/${id}/references`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteReference: (id: string, fileId: string) => api.delete(`/orders/${id}/references/${fileId}`),
};

// Vacancy API — artist-posted «Вакансия» (plan §5). Mirrors orderAPI but author is
// an Artist, the catalog is professions, and offers/responses replace deals.
export const vacancyAPI = {
  getMine: (params: { artistId: string; status?: string }) => api.get('/vacancies/mine', { params }),
  getOne: (id: string) => api.get(`/vacancies/${id}`),
  create: (data: any) => api.post('/vacancies', data),
  update: (id: string, data: any) => api.patch(`/vacancies/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/vacancies/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/vacancies/${id}`),
  getMatches: (id: string, params?: { page?: number; limit?: number }) => api.get(`/vacancies/${id}/matches`, { params }),
  respond: (id: string, data: { comment?: string; portfolioLinks?: { url: string; title: string; source: string }[]; hasPortfolioFiles?: boolean }) =>
    api.post(`/vacancies/${id}/responses`, data),
  uploadPortfolio: (id: string, responseId: string, formData: FormData) =>
    api.post(`/vacancies/${id}/responses/${responseId}/portfolio`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deletePortfolio: (id: string, responseId: string, fileId: string) =>
    api.delete(`/vacancies/${id}/responses/${responseId}/portfolio/${fileId}`),
  getResponses: (id: string) => api.get(`/vacancies/${id}/responses`),
  getMyOffers: () => api.get('/vacancies/my-offers'),
  getIncomingResponses: () => api.get('/vacancies/responses/incoming'),
  offerCandidate: (id: string, candidateId: string) => api.post(`/vacancies/${id}/offer`, { candidateId }),
  makeCooperation: (id: string, responseId: string, data: { startDate: string; conditions: string; compensation: string; extraDetails?: string }) =>
    api.post(`/vacancies/${id}/responses/${responseId}/cooperation`, data),
  acceptOffer: (offerId: string) => api.post(`/vacancies/offers/${offerId}/accept`),
  rejectOffer: (offerId: string) => api.post(`/vacancies/offers/${offerId}/reject`),
  uploadReferences: (id: string, formData: FormData) => api.post(`/vacancies/${id}/references`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteReference: (id: string, fileId: string) => api.delete(`/vacancies/${id}/references/${fileId}`),
};

export const referralAPI = {
  getStats: () => api.get('/referrals/stats'),
  getLinks: () => api.get('/referrals/links'),
  createLink: (label: string) => api.post('/referrals/links', { label }),
  renameLink: (id: string, label: string) => api.patch(`/referrals/links/${id}`, { label }),
  deleteLink: (id: string) => api.delete(`/referrals/links/${id}`),
  resolve: (code: string) => api.post('/referrals/resolve', { code }),
};

export const siteSettingsAPI = {
  get: () => api.get('/site-settings'),
  update: (data: Record<string, string>) => api.put('/admin/site-settings', data),
};

export const reviewAPI = {
  getForUser: (userId: string, sort?: string) =>
    api.get(`/reviews/user/${userId}`, { params: sort ? { sort } : undefined }),
  create: (data: { targetId: string; rating: number; text?: string; type?: string; serviceId?: string; dealId?: string }) =>
    api.post('/reviews', data),
  reply: (id: string, reply: string) =>
    api.patch(`/reviews/${id}/reply`, { reply }),
  delete: (id: string) =>
    api.delete(`/reviews/${id}`),
};

export const complaintAPI = {
  submit: (data: { targetType: 'user' | 'post' | 'review'; targetId: string; category: string; text?: string }) =>
    api.post('/complaints', data),
  list: (status?: string) => api.get('/complaints', { params: status ? { status } : undefined }),
  resolve: (id: string, data: { status: string; resolution?: string; blockDays?: number | 'forever'; deleteContent?: boolean }) =>
    api.patch(`/complaints/${id}`, data),
  stats: () => api.get('/complaints/stats'),
};

export const supportAPI = {
  // Запрос на добавление профессии/услуги, которой нет в каталоге → в поддержку
  requestProfession: (data: { profession: string; comment?: string }) =>
    api.post('/support/profession-request', data),
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
  priceMin?: string;
  priceMax?: string;
  customFilterValueIds?: string[];
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
