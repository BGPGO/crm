"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNavbar from "@/components/layout/Sidebar";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/unsubscribe"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  useEffect(() => {
    if (!loading && !isAuthenticated && !isPublicRoute) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, isPublicRoute, router]);

  // Public route: always render without navbar (never block with spinner)
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Show a full-page loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="text-sm text-gray-500">Carregando...</span>
        </div>
      </div>
    );
  }

  // Not authenticated and not a public route: render nothing (redirect will happen)
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated: render with navbar
  return (
    <>
      <TopNavbar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">{children}</div>
    </>
  );
}
