const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const VK_CLIENT_ID = '54535061';
const REDIRECT_URI = `${API_URL}/api/auth/vk/callback`;

const vkAuthUrl = `https://oauth.vk.com/authorize?${new URLSearchParams({
  client_id: VK_CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: 'email',
  v: '5.131',
})}`;

interface VkLoginButtonProps {
  disabled?: boolean;
}

export default function VkLoginButton({ disabled }: VkLoginButtonProps) {
  return (
    <a
      href={disabled ? undefined : vkAuthUrl}
      className={`w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-[#0077FF] hover:bg-[#0066DD] text-white font-medium rounded-xl transition-all shadow-lg shadow-[#0077FF]/20 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {/* VK icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.712-1.033-1.01-1.49-.857-1.49.189v1.523c0 .33-.105.522-1.238.522C10.696 17.645 8.91 16.525 7.675 14c-1.326-2.74-1.686-4.758-1.686-5.178 0-.33.127-.633.65-.633h1.745c.484 0 .667.227.854.76.94 2.713 2.521 5.095 3.17 5.095.244 0 .356-.112.356-.727V10.39c-.075-1.313-.766-1.424-.766-1.89 0-.23.185-.46.487-.46h2.743c.408 0 .553.22.553.68v3.65c0 .407.175.553.296.553.244 0 .45-.146 .9-.597 1.394-1.565 2.389-3.97 2.389-3.97.131-.276.366-.533.847-.533h1.744c.522 0 .635.268.522.633-.217.995-2.318 3.968-2.318 3.968-.183.3-.25.433 0 .766.183.244.784.752 1.186 1.21.735.843 1.298 1.55 1.448 2.039.131.482-.131.724-.65.724z"/>
      </svg>
      Войти через ВКонтакте
    </a>
  );
}
