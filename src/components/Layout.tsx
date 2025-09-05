import React from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="flex-1 w-full overflow-hidden"
      style={{
        paddingTop: 'var(--header-height)',
        paddingBottom: 'var(--tabbar-height)',
      }}
    >
      <div className="mobile-container h-full overflow-y-auto">
        {children}
      </div>
    </div>
  );
}