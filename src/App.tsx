import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import TeamPortal from "./pages/TeamPortal";
import AdminAuth from "./pages/AdminAuth";
import ResetPassword from "./pages/ResetPassword";
import ProgressorAuth from "./pages/ProgressorAuth";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./components/AdminRoute";
import { ProgressorRoute } from "./components/ProgressorRoute";

// Lazy load heavy pages with retry on chunk load failure
const lazyRetry = (importFn: () => Promise<any>) => {
  return new Promise<any>((resolve, reject) => {
    const hasRefreshed = sessionStorage.getItem('chunk_retry');
    importFn()
      .then((module) => {
        sessionStorage.removeItem('chunk_retry');
        resolve(module);
      })
      .catch((err) => {
        if (!hasRefreshed) {
          sessionStorage.setItem('chunk_retry', '1');
          window.location.reload();
        } else {
          sessionStorage.removeItem('chunk_retry');
          reject(err);
        }
      });
  });
};

const Index = lazy(() => lazyRetry(() => import("./pages/Index")));
const ProgressorWorkspace = lazy(() => lazyRetry(() => import("./pages/ProgressorWorkspace")));

const Roadmaps = lazy(() => lazyRetry(() => import("./pages/Roadmaps")));
const RoadmapEditor = lazy(() => lazyRetry(() => import("./pages/RoadmapEditor")));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

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
        <Routes>
          {isNativeApp ? (
            <>
              {/* Native app routes - Team Portal only */}
              <Route path="/" element={<Navigate to="/team" replace />} />
              <Route path="/team" element={<TeamPortal />} />
              <Route path="*" element={<Navigate to="/team" replace />} />
            </>
          ) : (
            <>
              {/* Web app routes - Full admin access */}
              <Route path="/admin" element={<AdminAuth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={
                <AdminRoute>
                  <Suspense fallback={<PageLoader />}>
                    <Index />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/team" element={<TeamPortal />} />
              <Route path="/progressor-login" element={<Navigate to="/progressor" replace />} />
              <Route path="/progressor" element={
                <AdminRoute>
                  <Suspense fallback={<PageLoader />}>
                    <ProgressorWorkspace />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/progressor-panel" element={<Navigate to="/progressor" replace />} />
              <Route path="/team-progressor" element={<Navigate to="/progressor" replace />} />
              <Route path="/roadmaps" element={
                <AdminRoute>
                  <Suspense fallback={<PageLoader />}>
                    <Roadmaps />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/roadmaps/:id" element={
                <AdminRoute>
                  <Suspense fallback={<PageLoader />}>
                    <RoadmapEditor />
                  </Suspense>
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
