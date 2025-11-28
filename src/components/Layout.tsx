import React from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="flex-1 w-full overflow-x-hidden container-responsive max-width-md"
      style={{
        paddingTop: 'var(--header-height)',
        paddingBottom: 'var(--tabbar-height)',
      }}
    >
      <div className="container-responsive max-width-md mx-auto px-4">
        {children}
      </div>
    </div>
  );
}