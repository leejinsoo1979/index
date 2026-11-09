import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isRelativeFileLink, resolveFileLink, rewriteWikiLinks, resolvePage } from '../../../wiki/markdown';
import type { WikiPage } from '../../../wiki/types';

type MarkdownNode = { type: string; depth?: number; position?: { start: { line: number } }; data?: { hProperties?: Record<string, unknown> }; children?: MarkdownNode[] };
function remarkHeadingIds() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === 'heading' && node.position) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: 'wiki-heading-' + (node.position.start.line - 1) } };
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export function WikiMarkdown({ content, pages, onNavigate, onCreate }: { content: string; pages: WikiPage[]; onNavigate: (id: string) => void; onCreate: (title: string) => void }) {
  const markdown = useMemo(() => rewriteWikiLinks(content), [content]);
  const components = useMemo(() => {
    return {
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        if (href?.startsWith('#wiki:')) {
          let target: string;
          try { target = decodeURIComponent(href.slice(6)); } catch { return <span>{children}</span>; }
          const page = resolvePage(target, pages);
          return <button className={'wk-wikilink' + (page ? '' : ' is-missing')} onClick={() => page ? onNavigate(page.id) : onCreate(target)} title={page ? '문서 열기' : '아직 없는 문서 · 새로 작성'}>{children}{!page && <sup>+</sup>}</button>;
        }
        if (href && isRelativeFileLink(href)) {
          const page = resolveFileLink(href, pages);
          return page ? <button className="wk-wikilink" onClick={() => onNavigate(page.id)} title="문서 열기">{children}</button> : <span>{children}</span>;
        }
        return <a href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a>;
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => src ? <img src={src} alt={alt || ''} loading="lazy" decoding="async" /> : <span className="wk-image-reference">이미지: {alt || '원본 자료 참조'}</span>,
    };
  }, [pages, onNavigate, onCreate]);
  return <div className="wk-prose"><ReactMarkdown remarkPlugins={[remarkGfm, remarkHeadingIds]} components={components}>{markdown}</ReactMarkdown></div>;
}
