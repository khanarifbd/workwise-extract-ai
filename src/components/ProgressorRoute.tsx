import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProgressorAuth } from '@/hooks/useProgressorAuth';
import { Loader2 } from 'lucide-react';

interface ProgressorRouteProps {
  children: ReactNode;
}

export const ProgressorRoute = ({ children }: ProgressorRouteProps) => {
  const { isAuthenticated, hasAccess, isLoading, isCheckingRoles } = useProgressorAuth();

  if (isLoading || isCheckingRoles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/progressor-login" replace />;
  }

  if (!hasAccess) {
    return <Navigate to="/progressor-login" replace />;
  }

  return <>{children}</>;
};
