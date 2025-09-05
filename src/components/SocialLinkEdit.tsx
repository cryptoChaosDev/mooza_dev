import React from "react";

interface SocialLinkEditProps {
  label: string;
  icon: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  statusText: string;
}

export function SocialLinkEdit({ label, icon, value, onChange, placeholder, statusText }: SocialLinkEditProps) {
  return (
    <div className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner">
      <span className="text-xl">{icon}</span>
      <input
        className="flex-1 bg-transparent outline-none text-base text-dark-text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
      />
      {value && (
        <button className="text-red-500 text-xs px-2" onClick={() => onChange("")} title="Отвязать"><span style={{fontSize: '1.2em'}}>✖</span></button>
      )}
    </div>
  );
}