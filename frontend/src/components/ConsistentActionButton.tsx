import React from "react";

interface ConsistentActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "small" | "medium" | "large";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export function ConsistentActionButton({
  onClick,
  children,
  variant = "primary",
  size = "medium",
  className = "",
  disabled = false,
  type = "button"
}: ConsistentActionButtonProps) {
  // Define base classes
  let baseClasses = "rounded-2xl font-medium transition-all flex items-center justify-center gap-2 ";
  
  // Add variant classes
  switch (variant) {
    case "primary":
      baseClasses += "bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-btn hover:opacity-90 ";
      break;
    case "secondary":
      baseClasses += "bg-dark-bg/60 text-dark-text hover:bg-dark-bg/80 ";
      break;
    case "danger":
      baseClasses += "bg-red-500/20 text-red-400 hover:bg-red-500/30 ";
      break;
    case "ghost":
      baseClasses += "bg-transparent text-dark-text hover:bg-dark-bg/60 ";
      break;
  }
  
  // Add size classes
  switch (size) {
    case "small":
      baseClasses += "px-3 py-2 text-sm ";
      break;
    case "medium":
      baseClasses += "px-4 py-3 text-base ";
      break;
    case "large":
      baseClasses += "px-6 py-4 text-lg ";
      break;
  }
  
  // Add disabled state
  if (disabled) {
    baseClasses += "opacity-50 cursor-not-allowed ";
  } else {
    baseClasses += "active:scale-95 hover:scale-105 ";
  }
  
  return (
    <button
      type={type}
      className={`${baseClasses}${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}