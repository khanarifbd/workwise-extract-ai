import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTesterPermissions, SectionKey } from '@/hooks/useTesterPermissions';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminRouteProps {
  children: ReactNode;
  section?: SectionKey;
}

export const AdminRoute = ({ children, section }: AdminRouteProps) => {
  const { isAuthenticated, hasAccess, isAdmin, isViewer, isTester, isLoading, isCheckingRoles } = useAdminAuth();
  const { isEnabled, loading: permsLoading } = useTesterPermissions();
  const location = useLocation();
  const requestedRoute = `${location.pathname}${location.search}${location.hash}`;
  const redirectParam = encodeURIComponent(requestedRoute);

  if (isLoading || isCheckingRoles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/welcome?redirect=${redirectParam}`} replace />;
  }

  if (!hasAccess) {
    return <Navigate to={`/admin?redirect=${redirectParam}`} replace />;
  }

  // Tester-specific section gating. Admins and viewers bypass.
  if (section && isTester && !isAdmin && !isViewer) {
    if (permsLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    if (!isEnabled(section)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-muted-foreground" />
                Section unavailable
              </CardTitle>
              <CardDescription>
                This section is not enabled for your tester preview. Ask an admin to enable it from Tester Access Control.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => window.history.back()} className="w-full">Go back</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  return <>{children}</>;
};
