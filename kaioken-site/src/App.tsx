import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home.tsx';
import Desktop from './pages/Desktop.tsx';
import DesktopBgPreview from './pages/DesktopBgPreview.tsx';
import Showcase from './pages/Showcase.tsx';
import Next from './pages/Next.tsx';
import DocsLayout from './pages/docs/DocsLayout.tsx';
import DocsIndex from './pages/docs/DocsIndex.tsx';
import Install from './pages/docs/Install.tsx';
import Tui from './pages/docs/Tui.tsx';
import CommandsDoc from './pages/docs/CommandsDoc.tsx';
import Agent from './pages/docs/Agent.tsx';
import Research from './pages/docs/Research.tsx';
import Impact from './pages/docs/Impact.tsx';
import Wiki from './pages/docs/Wiki.tsx';
import Cards from './pages/docs/Cards.tsx';
import Skills from './pages/docs/Skills.tsx';
import Update from './pages/docs/Update.tsx';
import Config from './pages/docs/Config.tsx';
import Integrations from './pages/docs/Integrations.tsx';
import OutputDoc from './pages/docs/OutputDoc.tsx';
import SiteHeader from './components/SiteHeader.tsx';
import SiteFooter from './components/SiteFooter.tsx';
import PageBackground from './components/PageBackground.tsx';

const PreviewLayout = lazy(() => import('./pages/preview/PreviewLayout.tsx'));
const PreviewIndex = lazy(() => import('./pages/preview/PreviewIndex.tsx'));
const PreviewDoc = lazy(() => import('./pages/preview/PreviewDoc.tsx'));

const OWN_BACKDROP = ['/desktop', '/desktop-bg-preview'];

function RouteBackdrop() {
  const { pathname } = useLocation();
  if (OWN_BACKDROP.includes(pathname)) return null;
  return <PageBackground variant="simple" />;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  React.useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

function RouteFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-32 sm:px-6">
      <p className="font-mono text-[13px] text-kai-dim">
        <span className="text-kai-orange">▎</span> loading…
      </p>
    </div>
  );
}

function SubpageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <ScrollToTop />
      <RouteBackdrop />
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<RouteFallback />}>{children}</Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

export const App: React.FC = () => {
  return (
    <Routes>
      {/* Main Home Page strictly preserved */}
      <Route path="/" element={<Home />} />

      {/* Fully integrated native pages with subpage chrome */}
      <Route
        path="/desktop"
        element={
          <SubpageLayout>
            <Desktop />
          </SubpageLayout>
        }
      />
      <Route
        path="/desktop-bg-preview"
        element={
          <SubpageLayout>
            <DesktopBgPreview />
          </SubpageLayout>
        }
      />
      <Route
        path="/showcase"
        element={
          <SubpageLayout>
            <Showcase />
          </SubpageLayout>
        }
      />
      <Route
        path="/next"
        element={
          <SubpageLayout>
            <Next />
          </SubpageLayout>
        }
      />
      <Route
        path="/docs"
        element={
          <SubpageLayout>
            <DocsLayout />
          </SubpageLayout>
        }
      >
        <Route index element={<DocsIndex />} />
        <Route path="install" element={<Install />} />
        <Route path="tui" element={<Tui />} />
        <Route path="commands" element={<CommandsDoc />} />
        <Route path="agent" element={<Agent />} />
        <Route path="research" element={<Research />} />
        <Route path="impact" element={<Impact />} />
        <Route path="wiki" element={<Wiki />} />
        <Route path="cards" element={<Cards />} />
        <Route path="skills" element={<Skills />} />
        <Route path="update" element={<Update />} />
        <Route path="config" element={<Config />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="output" element={<OutputDoc />} />
      </Route>
      <Route
        path="/preview"
        element={
          <SubpageLayout>
            <PreviewLayout />
          </SubpageLayout>
        }
      >
        <Route index element={<PreviewIndex />} />
        <Route path=":section/:doc" element={<PreviewDoc />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
