import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout() {
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className={`flex flex-1 flex-col ${isMobile ? "ml-0" : "ml-16 lg:ml-60"}`}>
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-surface p-4 sm:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      {isMobile && <BottomTabBar />}
    </div>
  );
}
