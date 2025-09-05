import React from "react";
import { getInterestPath } from "../utils";
import { UserProfile } from "../types";

// Новый универсальный компонент для отображения профиля
export function ProfileView({ profile, editable, onEdit }: { profile: UserProfile, editable?: boolean, onEdit?: () => void }) {
  // Собираем массив соцсетей: сначала из socials, если пусто — из vkId/youtubeId/telegramId
  let socialLinks: { url: string; label: string }[] = [];
  if (profile.socials && profile.socials.length > 0) {
    socialLinks = profile.socials.filter(Boolean).map(url => ({ url, label: url }));
  }
  if (profile.vkId) socialLinks.push({ url: profile.vkId.startsWith('http') ? profile.vkId : `https://vk.com/${profile.vkId}`, label: 'VK' });
  if (profile.youtubeId) socialLinks.push({ url: profile.youtubeId.startsWith('http') ? profile.youtubeId : `https://youtube.com/@${profile.youtubeId}`, label: 'YouTube' });
  if (profile.telegramId) socialLinks.push({ url: profile.telegramId.startsWith('http') ? profile.telegramId : `https://t.me/${profile.telegramId}`, label: 'Telegram' });

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md px-2 py-6">
      {/* Аватар и имя + кнопка редактирования */}
      <div className="flex flex-col items-center gap-1 w-full relative">
        <div className="relative w-28 h-28 mb-2 mx-auto">
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg bg-dark-bg/80 flex items-center justify-center">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
            ) : (
              <span role="img" aria-label="avatar" className="text-5xl">👤</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-center w-full mt-2">
          <div className="font-bold text-2xl sm:text-3xl text-dark-text text-center break-words leading-tight flex-1 text-center">{profile.firstName} {profile.lastName}</div>
          {editable && (
            <button
              className="ml-2 p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 text-dark-accent transition-colors shadow focus:outline-none"
              title="Редактировать профиль"
              onClick={onEdit}
              style={{height: 40, width: 40, minWidth: 40, minHeight: 40}}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
            </button>
          )}
        </div>
        {(profile.city || profile.country) && (
          <div className="text-blue-700 text-sm">{[profile.country, profile.city].filter(Boolean).join(', ')}</div>
        )}
      </div>
      {/* О себе */}
      {profile.bio && (
        <div className="w-full mt-4">
          <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">О себе</div>
          <div className="text-base text-dark-text text-center whitespace-pre-line font-normal mb-2">{profile.bio}</div>
        </div>
      )}
      {/* Место работы */}
      {profile.workPlace && (
        <div className="w-full mt-2">
          <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Место работы</div>
          <div className="text-dark-muted text-sm text-center mb-2">{profile.workPlace}</div>
        </div>
      )}
      {/* Навыки */}
      {profile.skills?.length > 0 && (
        <div className="w-full mt-2">
          <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Навыки</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {profile.skills.map((skill, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-gradient-to-r from-blue-500 to-cyan-400 text-white">{getInterestPath(skill)}</span>
            ))}
          </div>
        </div>
      )}
      {/* Интересы */}
      {profile.interests?.length > 0 && (
        <div className="w-full mt-2">
          <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Интересы</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {profile.interests.map((interest, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-cyan-100 text-cyan-800">{getInterestPath(interest)}</span>
            ))}
          </div>
        </div>
      )}
      {/* Портфолио */}
      {profile.portfolio && (profile.portfolio.text || profile.portfolio.fileUrl) && (
        <div className="w-full mt-2 flex flex-col items-center">
          <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Портфолио</div>
          {profile.portfolio.text && <div className="text-dark-text text-sm text-center whitespace-pre-line mb-1">{profile.portfolio.text}</div>}
          {profile.portfolio.fileUrl && (
            <a href={profile.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs">Скачать вложение</a>
          )}
        </div>
      )}
      {/* Контакты */}
      {(profile.phone || profile.email) && (
        <div className="w-full mt-2 flex flex-col items-center">
          <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Контакты</div>
          {profile.phone && <div className="text-dark-text text-sm">📞 <a href={`tel:${profile.phone}`} className="text-blue-500 underline">{profile.phone}</a></div>}
          {profile.email && <div className="text-dark-text text-sm">✉️ <a href={`mailto:${profile.email}`} className="text-blue-500 underline">{profile.email}</a></div>
}
        </div>
      )}
    </div>
  );
}