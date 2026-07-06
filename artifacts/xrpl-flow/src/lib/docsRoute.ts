import { DEFAULT_DOCS_PAGE_ID, parseDocsId } from './docsContent';

export interface DocsRoute {
  pageId: string;
  sectionId?: string;
}

function cleanSegment(segment: string | undefined): string | undefined {
  if (!segment) return undefined;
  return decodeURIComponent(segment).replace(/^#+/, '').trim() || undefined;
}

export function readDocsRouteFromLocation(location: Location = window.location): DocsRoute | null {
  const pathMatch = location.pathname.match(/^\/docs\/?([^/#?]+)?/);
  if (pathMatch) {
    return {
      pageId: cleanSegment(pathMatch[1]) || DEFAULT_DOCS_PAGE_ID,
      sectionId: cleanSegment(location.hash),
    };
  }

  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash.startsWith('docs')) return null;
  const [, pageId, sectionId] = hash.match(/^docs\/?([^/#]+)?\/?([^/#]+)?/) || [];
  return {
    pageId: cleanSegment(pageId) || DEFAULT_DOCS_PAGE_ID,
    sectionId: cleanSegment(sectionId),
  };
}

export function docsUrl(docsId: string): string {
  const { pageId, sectionId } = parseDocsId(docsId);
  return `/docs/${encodeURIComponent(pageId)}${sectionId ? `#${encodeURIComponent(sectionId)}` : ''}`;
}

export function navigateToDocs(docsId = DEFAULT_DOCS_PAGE_ID) {
  window.history.pushState({}, '', docsUrl(docsId));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function navigateToApp() {
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}
