// Extracts a user-facing message from an axios/API error.
// Prefers the server's `error`/`message`, falls back to a friendly RU message.
export function getApiError(e: any, fallback = 'Не удалось выполнить операцию. Попробуйте ещё раз.'): string {
  const data = e?.response?.data;
  const msg = data?.error || data?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
    return 'Нет соединения с сервером. Проверьте интернет и попробуйте снова.';
  }
  if (e?.response?.status === 413) return 'Файл слишком большой.';
  return fallback;
}
