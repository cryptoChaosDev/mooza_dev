import React from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-hidden container-responsive max-width-md mx-auto px-4">
      {children}
    </div>
  );
}
