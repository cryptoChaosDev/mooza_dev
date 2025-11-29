import React from "react";

export function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] pt-24 bg-dark-bg w-full px-2 sm:px-4 flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="text-3xl font-bold text-dark-text mb-2 w-full text-center sm:text-4xl" style={{fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif'}}>MOOZA</div>
      <div className="text-base text-dark-muted mb-6 w-full text-center sm:text-lg">Социальная сеть для музыкантов</div>
      <div className="w-full max-w-md bg-dark-card rounded-3xl shadow-lg p-4 sm:p-6 flex flex-col items-center">
        <div className="text-lg text-dark-text font-medium mb-2 w-full text-center sm:text-xl">Добро пожаловать!</div>
        <div className="text-dark-muted text-center w-full sm:text-base">Здесь вы можете найти друзей по интересам, общаться и развиваться вместе.</div>
      </div>
    </div>
  );
}