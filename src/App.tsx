import { Component, lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import TeamPortal from "./pages/TeamPortal";
import TeamArchive from "./pages/TeamArchive";
import AdminAuth from "./pages/AdminAuth";
import ResetPassword from "./pages/ResetPassword";
import ProgressorAuth from "./pages/ProgressorAuth";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./components/AdminRoute";
import { ProgressorRoute } from "./components/ProgressorRoute";
import { LastRouteRestorer } from "./components/LastRouteRestorer";

// Lazy load heavy pages. Never force-refresh the whole app: a reload loses the
// team's current job/sign-off/upload state and is more disruptive than showing
// a retry surface for stale chunks after deployments.
const lazyRetry = (importFn: () => Promise<any>) => {
  return importFn().catch((err) => {
    console.error("Page chunk failed to load without refreshing:", err);
    throw err;
  });
};

const Index = lazy(() => lazyRetry(() => import("./pages/Index")));
const ProgressorWorkspace = lazy(() => lazyRetry(() => import("./pages/ProgressorWorkspace")));
const AutoAssignPanel = lazy(() => lazyRetry(() => import("./pages/AutoAssignPanel")));

const Roadmaps = lazy(() => lazyRetry(() => import("./pages/Roadmaps")));
const RoadmapEditor = lazy(() => lazyRetry(() => import("./pages/RoadmapEditor")));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Page failed to load:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Page paused</h1>
          <p className="text-sm text-muted-foreground">The page could not finish loading. Your current browser session was kept intact.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10 * 60 * 1000, // 10 minutes before considering stale
      gcTime: 30 * 60 * 1000, // Keep unused data in cache for 30 minutes
      retry: 1,
      refetchOnMount: false, // Don't refetch if data exists in cache
    },
  },
});

// Check if running as native app (Capacitor)
const isNativeApp = Capacitor.isNativePlatform();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <LastRouteRestorer />
        <Routes>
          {isNativeApp ? (
            <>
              {/* Native app routes - Team Portal only */}
              <Route path="/" element={<Navigate to="/team" replace />} />
              <Route path="/team" element={<TeamPortal />} />
              <Route path="/archive" element={<TeamArchive />} />
              <Route path="*" element={<Navigate to="/team" replace />} />
            </>
          ) : (
            <>
              {/* Web app routes - Full admin access */}
              <Route path="/admin" element={<AdminAuth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={
                <AdminRoute>
                  <PageErrorBoundary><Suspense fallback={<PageLoader />}><Index /></Suspense></PageErrorBoundary>
                </AdminRoute>
              } />
              <Route path="/team" element={<TeamPortal />} />
              <Route path="/archive" element={<TeamArchive />} />
              <Route path="/progressor-login" element={<Navigate to="/progressor" replace />} />
              <Route path="/progressor" element={
                <AdminRoute>
                  <PageErrorBoundary><Suspense fallback={<PageLoader />}><ProgressorWorkspace /></Suspense></PageErrorBoundary>
                </AdminRoute>
              } />
              <Route path="/progressor-panel" element={<Navigate to="/progressor" replace />} />
              <Route path="/team-progressor" element={<Navigate to="/progressor" replace />} />
              <Route path="/auto-assign" element={
                <AdminRoute>
                  <PageErrorBoundary><Suspense fallback={<PageLoader />}><AutoAssignPanel /></Suspense></PageErrorBoundary>
                </AdminRoute>
              } />
              <Route path="/roadmaps" element={
                <AdminRoute>
                  <PageErrorBoundary><Suspense fallback={<PageLoader />}><Roadmaps /></Suspense></PageErrorBoundary>
                </AdminRoute>
              } />
              <Route path="/roadmaps/:id" element={
                <AdminRoute>
                  <PageErrorBoundary><Suspense fallback={<PageLoader />}><RoadmapEditor /></Suspense></PageErrorBoundary>
                </AdminRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
