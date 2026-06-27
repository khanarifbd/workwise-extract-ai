import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: ReactNode;
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { isAuthenticated, hasAccess, isLoading, isCheckingRoles } = useAdminAuth();
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

  return <>{children}</>;
};
