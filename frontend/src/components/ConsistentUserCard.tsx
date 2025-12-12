import React from "react";
import { UserProfile } from "../types";
import { getInterestPath } from "../utils";

interface ConsistentUserCardProps {
  user: UserProfile;
  onClick?: () => void;
  showMatchScore?: boolean;
  profile?: UserProfile; // For calculating match score
}

export function ConsistentUserCard({ user, onClick, showMatchScore = false, profile }: ConsistentUserCardProps) {
  // Calculate match score if needed
  const matchScore = profile && showMatchScore 
    ? user.interests.filter(interest => profile.interests.includes(interest)).length 
    : 0;

  return (
    <div 
      className="bg-dark-card rounded-3xl shadow-card p-5 flex flex-col gap-3 cursor-pointer hover:bg-dark-bg/80 transition border border-dark-bg/40"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-xl border-2 border-white flex-shrink-0">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" onError={(e) => {
              // Handle broken image by showing placeholder
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.style.display = 'none';
              target.parentElement!.innerHTML = '<span role="img" aria-label="avatar" class="text-lg">👤</span>';
            }} />
          ) : (
            <span role="img" aria-label="avatar" className="text-lg">👤</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-dark-text truncate text-lg">
            {user.firstName} {user.lastName}
          </div>
          {(user.city || user.country) && (
            <div className="text-dark-muted text-sm truncate">
              {[user.country, user.city].filter(Boolean).join(', ')}
            </div>
          )}
          {matchScore > 0 && (
            <div className="text-xs font-semibold text-green-400 mt-1">
              Совпадений: {matchScore}
            </div>
          )}
        </div>
      </div>
      
      {user.interests.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {user.interests.slice(0, 3).map((interest, i) => (
            <span key={i} className="px-2 py-1 rounded-full text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-400/30">
              {getInterestPath(interest)}
            </span>
          ))}
          {user.interests.length > 3 && (
            <span className="px-2 py-1 rounded-full text-xs bg-dark-bg/60 text-dark-muted">
              +{user.interests.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}