import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, Extension, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Bold, Italic, Link2, List, ListOrdered, Quote, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n';
import { composeMessages } from '@/lib/i18n/messages/compose';
import { cn } from '@/lib/utils';

// Editor styles: lines without paragraph gaps (like Gmail), lists, quotes, links, placeholder.
const EDITOR_CSS = `
.composer-prose { outline: none; min-height: 8rem; word-break: break-word; }
.composer-prose p { margin: 0; }
.composer-prose ul { list-style: disc; padding-left: 1.5rem; }
.composer-prose ol { list-style: decimal; padding-left: 1.5rem; }
.composer-prose blockquote { border-left: 2px solid var(--border); margin: 0.25rem 0; padding-left: 0.75rem; color: var(--muted-foreground); }
.composer-prose a { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; }
.composer-prose code { font-family: ui-monospace, monospace; font-size: 0.9em; background: var(--muted); border-radius: 4px; padding: 0 3px; }
.composer-prose > p.is-empty:first-child::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: var(--muted-foreground); }
`;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl+';

// ⌘↵ belongs to the composer (send), not to Tiptap's hard break.
const ComposerKeys = Extension.create({
  name: 'composerKeys',
  priority: 1000,
  addKeyboardShortcuts: () => ({ 'Mod-Enter': () => true })
});

export function useComposerEditor({ content, placeholder, onChange }: { content: string; placeholder: string; onChange: () => void }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' }
      }),
      Placeholder.configure({ placeholder }),
      ComposerKeys
    ],
    content: content.replace(/<p[^>]*>\s*<br\s*\/?>\s*<\/p>/gi, '<p></p>'),
    editorProps: { attributes: { class: 'composer-prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': placeholder } },
    onUpdate: () => changeRef.current()
  });
}

export function EditorBody({ editor, className }: { editor: Editor; className?: string }) {
  return (
    <>
      <style>{EDITOR_CSS}</style>
      <EditorContent editor={editor} className={cn('text-sm leading-relaxed', className)} />
    </>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  disabled,
  children
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} side="top">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        // Keep the editor's selection.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn('size-7 text-muted-foreground', active && 'bg-accent text-accent-foreground')}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function EditorToolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const t = useT(composeMessages);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo()
    })
  });
  const chain = () => editor.chain().focus();
  const sep = <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />;
  return (
    <div role="toolbar" aria-label={t('formatting')} className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
      <ToolButton label={`${t('bold')} (${modKey}B)`} active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label={`${t('italic')} (${modKey}I)`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton label={`${t('underline')} (${modKey}U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </ToolButton>
      <ToolButton label={t('strike')} active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolButton>
      {sep}
      <ToolButton label={t('bulletList')} active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label={t('orderedList')} active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label={t('quote')} active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </ToolButton>
      <ToolButton label={`${t('link')} (${modKey}K)`} active={s.link} onClick={onLink}>
        <Link2 />
      </ToolButton>
      <ToolButton label={t('clearFormatting')} onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting />
      </ToolButton>
      {sep}
      <ToolButton label={`${t('undo')} (${modKey}Z)`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 />
      </ToolButton>
      <ToolButton label={t('redo')} disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 />
      </ToolButton>
    </div>
  );
}

const normalizeUrl = (value: string) => {
  const v = value.trim();
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
};

// Insert or edit the link at the selection.
export function LinkDialog({ editor, open, onOpenChange }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(composeMessages);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [existing, setExisting] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (!open) return;
    editor.commands.extendMarkRange('link');
    const href = (editor.getAttributes('link').href as string | undefined) ?? '';
    const { from, to } = editor.state.selection;
    setExisting(Boolean(href));
    setUrl(href);
    setHasSelection(from !== to);
    setText('');
  }, [open, editor]);

  const apply = () => {
    const href = normalizeUrl(url);
    if (!href) return;
    if (hasSelection || existing) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    else {
      const label = text.trim() || url.trim();
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] })
        .insertContent(' ')
        .run();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm p-5"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <DialogTitle>{existing ? t('editLink') : t('insertLink')}</DialogTitle>
        <DialogDescription className="sr-only">{t('linkUrl')}</DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          {!hasSelection && !existing && (
            <div className="space-y-1.5">
              <Label htmlFor="composer-link-text">{t('linkText')}</Label>
              <Input id="composer-link-text" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="composer-link-url">{t('linkUrl')}</Label>
            <Input id="composer-link-url" autoFocus inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            {existing && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  onOpenChange(false);
                }}
              >
                {t('removeLink')}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              {t('apply')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
