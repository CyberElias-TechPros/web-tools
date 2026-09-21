import { Suspense, lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { MotionProvider } from "@/components/motion";
import { HomePage } from "@/pages/Home";
import { TOOL_LOADERS } from "@/tools/loaders";

const AboutPage = lazy(() => import("@/pages/About"));
const PrivacyPage = lazy(() => import("@/pages/Privacy"));
const NotFoundPage = lazy(() => import("@/pages/NotFound"));

/** One lazy component per slug, created once at module load. */
const LAZY_TOOLS: Record<
  string,
  LazyExoticComponent<ComponentType>
> = Object.fromEntries(
  Object.entries(TOOL_LOADERS).map(([slug, loader]) => [slug, lazy(loader)]),
);

function ToolFallback(): React.ReactElement {
  return (
    <div
      className="mx-auto max-w-[1400px] px-4 py-6"
      role="status"
      aria-label="Loading tool"
    >
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
    <MotionProvider>
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
    </MotionProvider>
  );
}

/** Maps the :slug param to its lazy component, 404-ing on anything unknown. */
function ToolRouter(): React.ReactElement {
  const { slug = "" } = useParams<{ slug: string }>();
  const Tool = LAZY_TOOLS[slug];
  if (!Tool) return <NotFoundPage />;
  return <Tool />;
}
