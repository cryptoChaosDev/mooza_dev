import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareButtonProps {
  url: string;       // relative or absolute URL to share
  title?: string;
  text?: string;
  className?: string;
  iconSize?: number;
  label?: string;    // optional label next to icon
}

export default function ShareButton({ url, title, text, className = '', iconSize = 15, label }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Try native share sheet (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch {
        // User cancelled or not supported — fall through to clipboard
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Last resort: prompt
      window.prompt('Скопируйте ссылку:', fullUrl);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      title={copied ? 'Ссылка скопирована!' : 'Поделиться'}
      className={className}
    >
      {copied
        ? <Check size={iconSize} className="text-green-400" />
        : label
          ? <><Share2 size={iconSize} />{label && <span>{label}</span>}</>
          : <Share2 size={iconSize} />
      }
    </button>
  );
}
