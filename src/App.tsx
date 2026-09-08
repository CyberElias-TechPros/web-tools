import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/pages/Home';

/**
 * Every tool is a separate lazy chunk. The landing page and shell stay in the
 * initial bundle so the first paint is instant; a tool's code (and only that
 * tool's code) downloads when the user opens it.
 */
const MarkdownTool = lazy(() => import('@/tools/markdown/MarkdownTool'));
const RegexTool = lazy(() => import('@/tools/regex/RegexTool'));
const JsonTool = lazy(() => import('@/tools/json/JsonTool'));
const ImageTool = lazy(() => import('@/tools/image/ImageTool'));
const CsvTool = lazy(() => import('@/tools/csv/CsvTool'));
const RenameTool = lazy(() => import('@/tools/rename/RenameTool'));
const TimezoneTool = lazy(() => import('@/tools/timezone/TimezoneTool'));
const SvgTool = lazy(() => import('@/tools/svg/SvgTool'));
const DiffTool = lazy(() => import('@/tools/diff/DiffTool'));
const PasswordTool = lazy(() => import('@/tools/password/PasswordTool'));
const AboutPage = lazy(() => import('@/pages/About'));
const PrivacyPage = lazy(() => import('@/pages/Privacy'));
const NotFoundPage = lazy(() => import('@/pages/NotFound'));

function ToolFallback(): React.ReactElement {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6" role="status" aria-label="Loading tool">
      <div className="skeleton mb-3 h-7 w-56 rounded-lg" />
      <div className="skeleton mb-6 h-4 w-full max-w-2xl rounded" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-80 rounded-xl" />
        <div className="skeleton h-80 rounded-xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function App(): React.ReactElement {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/tools/:slug"
          element={
            <Suspense fallback={<ToolFallback />}>
              <ToolRouter />
            </Suspense>
          }
        />
        <Route
          path="/about"
          element={
            <Suspense fallback={<ToolFallback />}>
              <AboutPage />
            </Suspense>
          }
        />
        <Route
          path="/privacy"
          element={
            <Suspense fallback={<ToolFallback />}>
              <PrivacyPage />
            </Suspense>
          }
        />
        {/* Legacy/naive URLs people guess or bookmark. */}
        <Route path="/tools" element={<Navigate to="/" replace />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<ToolFallback />}>
              <NotFoundPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

/** Maps the :slug param to its lazy component, 404-ing on anything unknown. */
function ToolRouter(): React.ReactElement {
  const { slug = '' } = useParams<{ slug: string }>();
  switch (slug) {
    case 'markdown-to-text':
      return <MarkdownTool />;
    case 'regex-tester':
      return <RegexTool />;
    case 'json-formatter':
      return <JsonTool />;
    case 'image-compressor':
      return <ImageTool />;
    case 'csv-json':
      return <CsvTool />;
    case 'file-renamer':
      return <RenameTool />;
    case 'timezone-planner':
      return <TimezoneTool />;
    case 'svg-generator':
      return <SvgTool />;
    case 'text-diff':
      return <DiffTool />;
    case 'password-generator':
      return <PasswordTool />;
    default:
      return <NotFoundPage />;
  }
}
