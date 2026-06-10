import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { mentionSuggestion } from './mentionSuggestion';
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Link2 } from 'lucide-react';

interface Props {
  value: string;                       // HTML
  onChange: (html: string) => void;    // '' when empty
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  onReady?: (editor: Editor) => void;  // exposes the instance (e.g. for emoji insert)
  onPasteImage?: (files: File[]) => void; // pasted images → handled by the parent
}

// WYSIWYG post editor (TipTap). Basic formatting: bold / italic / strike /
// bullet & ordered lists / blockquote / link. Emits HTML ('' when empty).
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 120, autoFocus, onReady, onPasteImage }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: placeholder || 'Напишите что-нибудь…' }),
      Mention.configure({
        HTMLAttributes: { class: 'post-mention' },
        suggestion: mentionSuggestion,
      }),
    ],
    content: value || '',
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    editorProps: {
      attributes: { class: 'rte-content' },
      handlePaste: (_view, event) => {
        const dt = event.clipboardData;
        if (!dt || !onPasteImage) return false;
        const files: File[] = [];
        for (const item of Array.from(dt.items || [])) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
        if (!files.length) for (const f of Array.from(dt.files || [])) if (f.type.startsWith('image/')) files.push(f);
        if (files.length) { event.preventDefault(); onPasteImage(files); return true; }
        return false;
      },
    },
  });

  // Reflect external value changes (draft load, reset after submit) without
  // fighting the user's caret while typing.
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    if (editor && onReady) onReady(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Ссылка (URL):', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const Btn = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md transition-colors ${active ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-slate-700 rounded-xl bg-slate-800/50 overflow-hidden focus-within:border-primary-500/50 transition-colors">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-700/60 flex-wrap">
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Жирный"><Bold size={15} /></Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Курсив"><Italic size={15} /></Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Зачёркнутый"><Strikethrough size={15} /></Btn>
        <span className="w-px h-4 bg-slate-700/70 mx-1" />
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Маркированный список"><List size={15} /></Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Нумерованный список"><ListOrdered size={15} /></Btn>
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Цитата"><Quote size={15} /></Btn>
        <span className="w-px h-4 bg-slate-700/70 mx-1" />
        <Btn active={editor.isActive('link')} onClick={setLink} title="Ссылка"><Link2 size={15} /></Btn>
      </div>
      <EditorContent editor={editor} className="rte-editor px-3 py-2.5 text-sm text-white" style={{ minHeight }} />
    </div>
  );
}
