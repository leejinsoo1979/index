import type { BookAction, BookPage, Flipbook } from "../lib/flipbooks";
import { MODERN_TEMPLATES } from "./book-templates-modern";
import { COLLECTION_TEMPLATES } from "./book-templates-collection";
import { EDITORIAL_TEMPLATES } from "./book-templates-editorial";
import { enhanceMagazineTemplate } from "./book-editorial-graphics";

export type TemplateCategory = "brochure" | "interior" | "furniture" | "flyer" | "album" | "flipbook" | "ebook" | "guide" | "manual" | "newsletter" | "handbook" | "presentation" | "portfolio" | "newspaper" | "booklet" | "lookbook" | "pamphlet" | "moodboard";
export type BookTemplate = { id: string; name: string; subtitle: string; category: TemplateCategory; palette: string[]; book: Flipbook };
export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [["brochure", "브로셔"], ["interior", "잡지"], ["furniture", "카탈로그"], ["flyer", "전단지"], ["album", "사진 앨범"], ["flipbook", "플립북"], ["ebook", "전자책"], ["guide", "가이드북"], ["manual", "매뉴얼"], ["newsletter", "뉴스레터"], ["handbook", "핸드북"], ["presentation", "프레젠테이션"], ["portfolio", "포트폴리오"], ["newspaper", "신문"], ["booklet", "북렛"], ["lookbook", "룩북"], ["pamphlet", "소책자"], ["moodboard", "무드보드"]].map(([value, label]) => ({ value: value as TemplateCategory, label }));
export const BOOK_TEMPLATES: BookTemplate[] = [...EDITORIAL_TEMPLATES, ...MODERN_TEMPLATES, ...COLLECTION_TEMPLATES].map((template, index) => ({ ...template, book: enhanceMagazineTemplate(template.book, template.palette[2] ?? template.palette[1], index) }));

export type TemplatePlacement = "after-current" | "at-end" | "replace";
const freshId = () => crypto.randomUUID();
/** Every application owns its IDs. Links to pages omitted by the selection are discarded. */
export function instantiateTemplatePages(pages: BookPage[], selectedIds: string[], nextId = freshId): BookPage[] {
  const chosen = pages.filter(p => selectedIds.includes(p.id));
  const pageIds = new Map(chosen.map(p => [p.id, nextId()]));
  const elementIds = new Map(chosen.flatMap(p => p.elements.map(e => [e.id, nextId()] as const)));
  const groups = new Map<string, string>();
  const action = (a: BookAction): BookAction[] => {
    if (a.kind === "page") return pageIds.has(a.pageId) ? [{ ...a, pageId: pageIds.get(a.pageId)! }] : [];
    if (a.kind === "play" || a.kind === "toggle") return elementIds.has(a.targetId) ? [{ ...a, targetId: elementIds.get(a.targetId)! }] : [];
    return [a];
  };
  return structuredClone(chosen).map(p => ({ ...p, id: pageIds.get(p.id)!, elements: p.elements.map(e => {
    if (e.groupId && !groups.has(e.groupId)) groups.set(e.groupId, nextId());
    return { ...e, id: elementIds.get(e.id)!, ...(e.groupId ? { groupId: groups.get(e.groupId) } : {}), ...(e.actions ? { actions: e.actions.flatMap(action) } : {}) };
  }) }));
}

export function applyBookTemplate(book: Flipbook, template: BookTemplate, selectedIds: string[], placement: TemplatePlacement, currentIndex: number, useTemplateSize = false): { book: Flipbook; firstIndex: number } {
  const inserted = instantiateTemplatePages(template.book.pages, selectedIds);
  if (!inserted.length) return { book, firstIndex: currentIndex };
  const firstIndex = placement === "replace" ? 0 : placement === "at-end" ? book.pages.length : Math.min(book.pages.length, Math.max(0, currentIndex + 1));
  const pages = placement === "replace" ? inserted : [...book.pages.slice(0, firstIndex), ...inserted, ...book.pages.slice(firstIndex)];
  const assets = [...book.assets];
  // Offer template media in the editor's image panel, without duplicating uploaded assets.
  for (const asset of template.book.assets) if (!assets.some(a => a.url === asset.url)) assets.push({ ...asset });
  return { firstIndex, book: { ...book, pages, assets, ...(placement === "replace" && useTemplateSize ? { width: template.book.width, height: template.book.height } : {}) } };
}
