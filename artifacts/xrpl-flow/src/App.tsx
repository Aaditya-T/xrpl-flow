import { useEffect, useState } from 'react';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { DocsPage } from './components/DocsPage';
import { TooltipProvider } from './components/ui/tooltip';
import { readDocsRouteFromLocation, type DocsRoute } from './lib/docsRoute';

export default function App() {
  const [docsRoute, setDocsRoute] = useState<DocsRoute | null>(() => readDocsRouteFromLocation());

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const syncRoute = () => setDocsRoute(readDocsRouteFromLocation());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      {docsRoute ? <DocsPage pageId={docsRoute.pageId} sectionId={docsRoute.sectionId} /> : <WorkflowCanvas />}
    </TooltipProvider>
  );
}
