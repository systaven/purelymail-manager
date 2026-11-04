import { useEffect, useMemo, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { cn } from '@/lib/utils';

const csp = (images: boolean) =>
  `default-src 'none'; img-src data: ${images ? 'https: http:' : ''}; style-src 'unsafe-inline'; font-src data:`;

const QUOTE_SELECTORS = '.gmail_quote, .gmail_extra, .yahoo_quoted, .moz-cite-prefix, .moz-cite-prefix + blockquote';
const QUOTE_RE = /class="[^"]*\b(gmail_quote|gmail_extra|yahoo_quoted|moz-cite-prefix)\b/;

export function htmlDocument(html: string, images: boolean, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp(images)}"><base target="_blank"><style>
html{background:#fff;color:#1f2328;overflow-y:hidden}
body{margin:0;padding:16px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Hiragino Sans","Microsoft YaHei",sans-serif;overflow-wrap:break-word}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
a{color:#2563eb}
${extraCss}</style></head><body>${html}</body></html>`;
}

// Sanitized HTML mail in a sandboxed, script-less iframe sized to its content.
// Mail stays on white even in dark mode: most of it assumes so.
function HtmlFrame({ html, images }: { html: string; images: boolean }) {
  const t = useT(mailMessages);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const hasQuote = useMemo(() => QUOTE_RE.test(html), [html]);
  const [showQuote, setShowQuote] = useState(false);
  const srcDoc = useMemo(
    () => htmlDocument(html, images, hasQuote && !showQuote ? `${QUOTE_SELECTORS}{display:none!important}` : ''),
    [html, images, hasQuote, showQuote]
  );
  const cleanup = useRef<() => void>(undefined);
  useEffect(() => () => cleanup.current?.(), []);

  const onLoad = () => {
    cleanup.current?.();
    const frame = ref.current;
    const doc = frame?.contentDocument;
    const win = doc?.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!frame || !doc || !win) return;
    const measure = () => doc.body && setHeight(Math.ceil(doc.body.getBoundingClientRect().height) + 2);
    // Shrink mail laid out wider than the pane (600px newsletters on phones).
    const fit = () => {
      const body = doc.body;
      if (!body) return;
      body.style.zoom = '';
      const width = doc.documentElement.clientWidth;
      if (body.scrollWidth > width + 4) body.style.zoom = String(Math.max(0.45, width / body.scrollWidth));
      measure();
    };
    fit();
    const ro = new win.ResizeObserver(measure);
    ro.observe(doc.body);
    const images = Array.from(doc.images);
    images.forEach((img) => img.addEventListener('load', fit));
    cleanup.current = () => {
      ro.disconnect();
      images.forEach((img) => img.removeEventListener('load', fit));
    };
  };

  return (
    <div>
      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-border/60">
        <iframe
          ref={ref}
          title={t('messageBody')}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={srcDoc}
          onLoad={onLoad}
          className="block w-full border-0 bg-white"
          style={{ height }}
        />
      </div>
      {hasQuote && <QuoteToggle shown={showQuote} onClick={() => setShowQuote((v) => !v)} />}
    </div>
  );
}

function QuoteToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  const t = useT(mailMessages);
  return (
    <button
      type="button"
      onClick={onClick}
      title={shown ? t('hideQuoted') : t('showQuoted')}
      aria-label={shown ? t('hideQuoted') : t('showQuoted')}
      aria-expanded={shown}
      className="mt-2 inline-flex h-5 items-center rounded-full bg-muted px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Ellipsis className="size-4" />
    </button>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;
const ATTRIBUTION_RE = /^(On .+wrote:|.+ wrote:|.*写道[:：]?|.*寫道[:：]?|.*のメッセージ[:：]?|.*schrieb:|-{2,}\s*Original Message\s*-{2,}|-{2,}\s*原始邮件\s*-{2,})$/i;

// Index of the line where a trailing quoted block starts ("On … wrote:" + "> …"), or -1.
function quoteStart(lines: string[]) {
  let i = lines.length;
  while (i > 0 && (lines[i - 1].startsWith('>') || !lines[i - 1].trim())) i--;
  if (i === lines.length || !lines.slice(i).some((l) => l.startsWith('>'))) return -1;
  let j = i;
  while (j > 0 && !lines[j - 1].trim()) j--;
  if (j > 0 && ATTRIBUTION_RE.test(lines[j - 1].trim())) j--;
  return lines.slice(0, j).some((l) => l.trim()) ? j : -1;
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}

function TextBody({ text }: { text: string }) {
  const lines = useMemo(() => text.replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n'), [text]);
  const cut = useMemo(() => quoteStart(lines), [lines]);
  const [showQuote, setShowQuote] = useState(false);
  const visible = cut >= 0 && !showQuote ? lines.slice(0, cut) : lines;
  return (
    <div>
      <div className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]')}>
        <Linkified text={visible.join('\n')} />
      </div>
      {cut >= 0 && <QuoteToggle shown={showQuote} onClick={() => setShowQuote((v) => !v)} />}
    </div>
  );
}

export function MessageBody({ html, text, images }: { html: string | null; text: string; images: boolean }) {
  if (html) return <HtmlFrame html={html} images={images} />;
  return <TextBody text={text} />;
}
