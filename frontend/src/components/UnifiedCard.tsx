import React from "react";

interface UnifiedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function UnifiedCard({ children, className = "", onClick }: UnifiedCardProps) {
  return (
    <div 
      className={`bg-dark-card rounded-3xl shadow-card p-5 flex flex-col gap-4 animate-fade-in animate-scale-in border border-dark-bg/40 font-sans transition-all duration-300 outline-none ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}