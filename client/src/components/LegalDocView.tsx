import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useSeo, seoTitle, ROBOTS_INDEX } from '../lib/seo';

// Full-page view of a legal document, rendered from the single source of truth
// in /public/legal/*.html (same files the footer «Документы» popup uses).
export default function LegalDocView({ slug, title }: { slug: string; title: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/legal/${slug}.html`)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((t) => { if (alive) setContent(t); })
      .catch(() => { if (alive) setContent('<p>Не удалось загрузить документ. Попробуйте позже.</p>'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  // /privacy и /terms индексируются в обоих режимах (как сейчас на PROD) — явный
  // index вместо сброса useSeo «noindex, follow» от предыдущей страницы при SPA-переходе.
  useSeo({ title: seoTitle(title), robots: ROBOTS_INDEX });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 text-sm"
        >
          <ArrowLeft size={16} /> На главную
        </Link>
        <h1 className="text-2xl font-bold text-white mb-6">{title}</h1>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={26} className="animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="legal-prose" dangerouslySetInnerHTML={{ __html: content }} />
        )}
      </div>
    </div>
  );
}
