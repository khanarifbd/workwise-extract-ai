import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import Index from "./pages/Index";
import TeamPortal from "./pages/TeamPortal";
import AdminAuth from "./pages/AdminAuth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./components/AdminRoute";

const queryClient = new QueryClient();

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
                  <Index />
                </AdminRoute>
              } />
              <Route path="/team" element={<TeamPortal />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
