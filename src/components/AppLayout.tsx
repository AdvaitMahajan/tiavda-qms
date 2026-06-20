import { Outlet, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";

export function AppLayout() {
  const { isPlatformAdmin, profileLoading } = useAuth();
  const { pathname } = useLocation();

  // Platform owner = pure admin console: no per-org operational screens. Keep
  // them within /admin (their account has no business org to operate).
  if (!profileLoading && isPlatformAdmin && !pathname.startsWith("/admin")) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar: hidden on mobile, icon-only on tablet (md), full on desktop (lg) */}
      <AppSidebar />
      {/* Main content: no left margin on mobile, w-16 offset on tablet, w-60 on desktop */}
      <div className="flex flex-1 flex-col min-w-0 md:ml-16 lg:ml-60">
        <TopBar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0" style={{ background: "#F0F4F8" }}>
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
      {/* Bottom tab bar: only on mobile, and only for org users (operational nav). */}
      {!isPlatformAdmin && <BottomTabBar />}
    </div>
  );
}
