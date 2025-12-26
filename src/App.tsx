import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import TeamPortal from "./pages/TeamPortal";
import TeamQRCode from "./pages/TeamQRCode";
import AdminAuth from "./pages/AdminAuth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./components/AdminRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path="/admin" element={<AdminAuth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={
            <AdminRoute>
              <Index />
            </AdminRoute>
          } />
          <Route path="/team" element={<TeamPortal />} />
          <Route path="/team-qr" element={<TeamQRCode />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
