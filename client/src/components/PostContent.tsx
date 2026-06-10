import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';

// Whitelist matching what RichTextEditor can produce (formatting + mention spans).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'strike', 'del', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'data-id', 'data-type', 'data-label', 'data-mention-id'];
const URL_RE = /(https?:\/\/[^\s<]+)/g;

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

// Turn bare URLs inside text nodes of already-sanitized HTML into links.
// Skips text already inside an <a> (e.g. editor autolinks / mentions).
function linkifyHtml(html: string): string {
  if (typeof document === 'undefined' || !html.includes('http')) return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || '';
        if (!URL_RE.test(text)) return;
        const frag = document.createDocumentFragment();
        let last = 0;
        text.replace(URL_RE, (url: string, _m: string, idx: number) => {
          if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
          const a = document.createElement('a');
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
          a.textContent = url;
          frag.appendChild(a);
          last = idx + url.length;
          return url;
        });
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== 'A') {
        walk(child);
      }
    });
    URL_RE.lastIndex = 0;
  };
  walk(root);
  return root.innerHTML;
}

// Renders post content. New posts are HTML from the editor (sanitized + linkified
// here); legacy posts are plain text — line breaks preserved, bare URLs linkified.
// @-mentions are clickable (navigate to the mentioned user's profile).
export default function PostContent({ content, className = '' }: { content?: string | null; className?: string }) {
  const navigate = useNavigate();
  const isHtml = !!content && looksLikeHtml(content);

  const safeHtml = useMemo(() => {
    if (!isHtml || !content) return '';
    return linkifyHtml(DOMPurify.sanitize(content, { ALLOWED_TAGS, ALLOWED_ATTR }));
  }, [content, isHtml]);

  if (!content) return null;

  if (!isHtml) {
    // Legacy plain text: preserve line breaks, make bare URLs clickable.
    const parts = content.split(URL_RE);
    return (
      <div className={`post-prose whitespace-pre-wrap break-words ${className}`}>
        {parts.map((part, i) =>
          /^https?:\/\//.test(part) ? (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>{part}</a>
          ) : (
            part
          ),
        )}
      </div>
    );
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const mention = (e.target as HTMLElement).closest('.post-mention') as HTMLElement | null;
    if (mention) {
      const id = mention.getAttribute('data-id') || mention.getAttribute('data-mention-id');
      if (id) { e.preventDefault(); navigate(`/profile/${id}`); }
    }
  };

  return (
    <div
      className={`post-prose break-words ${className}`}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
