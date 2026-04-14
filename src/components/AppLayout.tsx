import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar: hidden on mobile, icon-only on tablet (md), full on desktop (lg) */}
      <AppSidebar />
      {/* Main content: no left margin on mobile, w-16 offset on tablet, w-60 on desktop */}
      <div className="flex flex-1 flex-col md:ml-16 lg:ml-60">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-surface p-4 sm:p-6 pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      {/* Bottom tab bar: only on mobile */}
      <BottomTabBar />
    </div>
  );
}
