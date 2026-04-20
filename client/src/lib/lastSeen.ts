export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return '';
  const diff = (Date.now() - new Date(lastSeenAt).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `был(а) в сети ${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `был(а) в сети ${Math.floor(diff / 3600)} ч назад`;
  if (diff < 7 * 86400) return `был(а) в сети ${Math.floor(diff / 86400)} д назад`;
  return `был(а) в сети ${new Date(lastSeenAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}
