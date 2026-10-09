// Просмотр документов портфолио.
// Встроенный просмотр в <iframe> работает только для PDF на десктопе: мобильные
// браузеры его не тянут (Android Chrome не рендерит PDF во фрейме вовсе, iOS
// Safari показывает лишь первую страницу), а DOC/XLS не рендерятся нигде.
// В остальных случаях документ открывается в новой вкладке — браузер покажет
// его своим просмотрщиком или скачает.

function isMobileBrowser(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ представляется как Macintosh — отличаем по тач-экрану.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

export function canPreviewInline(file: { mimeType?: string | null; originalName?: string | null }): boolean {
  const isPdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.originalName ?? '');
  return isPdf && !isMobileBrowser();
}

export function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
