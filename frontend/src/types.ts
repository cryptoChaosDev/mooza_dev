// Тип профиля пользователя
export interface UserProfile {
  userId: string;
  avatarUrl?: string;
  firstName: string;
  lastName: string;
  name: string; // для обратной совместимости, можно склеивать firstName + lastName
  bio: string;
  workPlace?: string;
  skills: string[];
  interests: string[];
  portfolio?: { 
    text: string; 
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
  };
  phone?: string;
  email?: string;
  socials?: string[];
  vkId?: string;
  youtubeId?: string;
  telegramId?: string;
  city?: string;
  country?: string;
  profileType?: string;
  middleName?: string;
  isSeller?: boolean;
  isEmployer?: boolean;
  myGroup?: string;
  education?: string;
  userInterests?: string[];
}

export interface Post {
  id: number;
  userId: string;
  author: string;
  avatarUrl?: string;
  content: string;
  tags: string[];
  liked: boolean;
  favorite: boolean;
  attachmentUrl?: string;
  createdAt: string;
  updatedAt: string;
}