/**
 * Dev-only design preview of the INDEX wiki (served by Vite at /wiki-preview.html; not part
 * of the production build). Renders the real WikiLibrary with an in-memory repository fed by
 * a local snapshot of wiki pages, so the UI can be checked without signing in.
 * Snapshot: node_modules/.cache/wiki-preview-pages.json (exported from the local knowledge server).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WikiLibrary } from '@archi-web/pages/StudioWiki';
import { normalizeDraft, type WikiPage, type WikiRepository } from '../../wiki/types';
import '@/styles/global.css';
// studio.css is left out on purpose: the wiki is styled only by StudioWiki.css.

function memoryRepository(seed: WikiPage[]): WikiRepository {
  let pages = seed;
  return {
    mode: 'server',
    async list() {
      return pages;
    },
    async save(draft, options) {
      const now = new Date().toISOString();
      const current = pages.find((p) => p.id === options.id);
      const page: WikiPage = {
        ...(current ?? { id: crypto.randomUUID(), workspaceId: 'preview', createdAt: now, aliases: [] }),
        ...normalizeDraft(draft),
        version: (current?.version ?? 0) + 1,
        updatedAt: now,
        updatedBy: 'preview',
      } as WikiPage;
      pages = [page, ...pages.filter((p) => p.id !== page.id)];
      return page;
    },
    async history() {
      return [];
    },
  };
}

const snapshot = '/node_modules/.cache/wiki-preview-pages.json';
const seed: WikiPage[] = await fetch(snapshot).then((r) => (r.ok ? r.json() : [])).catch(() => []);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <div className="archi-studio">
        <WikiLibrary repository={memoryRepository(seed)} workspaceId="preview" actor="디자인 미리보기" />
      </div>
    </BrowserRouter>
  </React.StrictMode>,
);
