import React from "react";
// getInterestPath removed — skills/interests are managed on a separate page
import { UserProfile } from "../types";

// Современный компонент для отображения профиля
export function ProfileView({ profile, editable, onEdit }: { profile: UserProfile, editable?: boolean, onEdit?: () => void }) {
  // Собираем массив соцсетей
  let socialLinks: { url: string; label: string }[] = [];
  if (profile.socials && profile.socials.length > 0) {
    socialLinks = profile.socials.filter(Boolean).map(url => ({ url, label: url }));
  }
  if (profile.vkId) socialLinks.push({ url: profile.vkId.startsWith('http') ? profile.vkId : `https://vk.com/${profile.vkId}`, label: 'VK' });
  if (profile.youtubeId) socialLinks.push({ url: profile.youtubeId.startsWith('http') ? profile.youtubeId : `https://youtube.com/@${profile.youtubeId}`, label: 'YouTube' });
  if (profile.telegramId) socialLinks.push({ url: profile.telegramId.startsWith('http') ? profile.telegramId : `https://t.me/${profile.telegramId}`, label: 'Telegram' });
  
  // Функция для иконок соцсетей
  const getSocialIcon = (url: string) => {
    if (url.includes('vk.com')) return (
      <div className="w-12 h-12 rounded-2xl bg-[#45668E] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105">
        <span className="text-white font-bold text-xs">VK</span>
      </div>
    );
    if (url.includes('t.me') || url.includes('telegram')) return (
      <div className="w-12 h-12 rounded-2xl bg-[#0088cc] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105">
        <span className="text-white font-bold text-xs">TG</span>
      </div>
    );
    if (url.includes('instagram.com')) return (
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105">
        <span className="text-white font-bold text-xs">IG</span>
      </div>
    );
    if (url.includes('youtube.com')) return (
      <div className="w-12 h-12 rounded-2xl bg-[#ff0000] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105">
        <span className="text-white font-bold text-xs">YT</span>
      </div>
    );
    return (
      <div className="w-12 h-12 rounded-2xl bg-dark-bg/60 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#888"/>
        </svg>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full overflow-x-hidden">
      {/* Аватар и имя + кнопка редактирования */}
      <div className="flex flex-col items-center gap-4 w-full relative overflow-x-hidden">
        <div className="relative">
          <div className="w-28 h-28 rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-dark-bg/80 flex items-center justify-center">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span role="img" aria-label="avatar" className="text-5xl">👤</span>
            )}
          </div>
          {editable && (
            <button
              className="absolute -bottom-2 -right-2 p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-xl hover:opacity-90 transition-all hover:scale-110"
              title="Редактировать профиль"
              onClick={onEdit}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg>
            </button>
          )}
        </div>
        
        <div className="flex flex-col items-center gap-2">
          <div className="font-bold text-2xl text-dark-text text-center break-words leading-tight">
            {profile.firstName} {profile.lastName}
          </div>
          {(profile.city || profile.country) && (
            <div className="text-blue-400 text-sm font-medium flex items-center gap-2 bg-blue-500/10 px-4 py-2 rounded-full">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="currentColor"/>
              </svg>
              {[profile.country, profile.city].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>
      
      {/* О себе */}
      {profile.bio && (
        <div className="w-full text-center">
          <div className="text-dark-text text-base whitespace-pre-line font-normal bg-dark-bg/30 rounded-3xl p-5 shadow-inner">{profile.bio}</div>
        </div>
      )}
      
      {/* Место работы */}
      {profile.workPlace && (
        <div className="flex items-center gap-3 text-dark-text text-sm bg-dark-bg/40 rounded-2xl px-5 py-3 shadow-sm">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <path d="M3 21h18v-2H3v2zM19 9h-2V7h2v2zm0-4h-2V3h2v2zm-4 8h-2v-2h2v2zm0-4h-2V7h2v2zm0-4h-2V3h2v2zm-8 8H5v-2h2v2zm0-4H5V7h2v2zm0-4H5V3h2v2zm-4 8h2v2H3v-2h2v-2H3v2h2v-2H3v2zm16 0h2v2h-2v-2zm0-2v-2h2v2h-2z" fill="currentColor"/>
          </svg>
          <span>{profile.workPlace}</span>
        </div>
      )}
      
      {/* Навыки и интересы теперь управляются на отдельной странице */}
      
      {/* Портфолио */}
      {profile.portfolio && (profile.portfolio.text || profile.portfolio.fileUrl) && (
        <div className="w-full flex flex-col items-center gap-3 bg-dark-bg/30 rounded-3xl p-5 shadow-inner">
          <div className="text-sm font-semibold text-dark-muted uppercase tracking-wider">Портфолио</div>
          {profile.portfolio.text && <div className="text-dark-text text-sm text-center whitespace-pre-line">{profile.portfolio.text}</div>}
          {profile.portfolio.fileUrl && (
            <a href={profile.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline text-sm flex items-center gap-2 hover:text-blue-300 transition-colors">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M16 13H8" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M16 17H8" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 9H8" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Скачать вложение
            </a>
          )}
        </div>
      )}
      
      {/* Социальные сети */}
      {socialLinks.length > 0 && (
        <div className="w-full">
          <div className="text-sm font-semibold text-dark-muted mb-3 uppercase tracking-wider text-center">Социальные сети</div>
          <div className="flex justify-center gap-4 flex-wrap">
            {socialLinks.map((link, i) => (
              <a 
                key={i} 
                href={link.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
                title={link.label}
              >
                {getSocialIcon(link.url)}
              </a>
            ))}
          </div>
        </div>
      )}
      
      {/* Контакты */}
      {(profile.phone || profile.email) && (
        <div className="w-full flex flex-col items-center gap-3 bg-dark-bg/30 rounded-3xl p-5 shadow-inner">
          <div className="text-sm font-semibold text-dark-muted uppercase tracking-wider">Контакты</div>
          <div className="flex flex-col items-center gap-2">
            {profile.phone && (
              <a href={`tel:${profile.phone}`} className="text-blue-400 underline text-sm flex items-center gap-2 hover:text-blue-300 transition-colors">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                  <path d="M3 7c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V7z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                {profile.phone}
              </a>
            )}
            {profile.email && (
              <a href={`mailto:${profile.email}`} className="text-blue-400 underline text-sm flex items-center gap-2 hover:text-blue-300 transition-colors">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                  <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                {profile.email}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}