import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Whitelist matching what RichTextEditor can produce (+ mention spans for later).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'strike', 'del', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'data-id', 'data-type', 'data-mention-id'];

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

// Renders post content. New posts are HTML from the editor (sanitized here);
// legacy posts are plain text — rendered with preserved line breaks.
export default function PostContent({ content, className = '' }: { content?: string | null; className?: string }) {
  const isHtml = !!content && looksLikeHtml(content);

  const safeHtml = useMemo(() => {
    if (!isHtml || !content) return '';
    return DOMPurify.sanitize(content, { ALLOWED_TAGS, ALLOWED_ATTR });
  }, [content, isHtml]);

  if (!content) return null;

  if (!isHtml) {
    return <div className={`post-prose whitespace-pre-wrap break-words ${className}`}>{content}</div>;
  }
  return (
    <div
      className={`post-prose break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
