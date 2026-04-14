import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Table2, Settings } from "lucide-react";

const tabs = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/enquiries", label: "Enquiries", icon: FileText },
  { path: "/clients", label: "Clients", icon: Users },
  { path: "/rate-matrix", label: "Rates", icon: Table2 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t bg-card"
      style={{ borderTopColor: "#CBD5E1" }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + "/");
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className="flex flex-col items-center gap-0.5 py-1"
          >
            <tab.icon
              className="h-5 w-5"
              style={{ color: active ? "#D4930A" : "#64748B" }}
            />
            <span
              className="text-[10px] font-medium"
              style={{ color: active ? "#D4930A" : "#64748B" }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
