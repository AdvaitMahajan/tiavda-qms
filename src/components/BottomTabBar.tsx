import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, ClipboardList, Settings } from "lucide-react";
import { useRole } from "@/hooks/useRole";

const tabs = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/enquiries", icon: FileText, label: "Enquiries" },
  { path: "/clients", icon: Users, label: "Clients" },
  { path: "/quotation-config", icon: ClipboardList, label: "Quotes", adminOnly: true },
  { path: "/settings", icon: Settings, label: "Settings", adminOnly: true },
];

export function BottomTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useRole();
  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#CBD5E1] flex items-center justify-around z-50 md:hidden">
      {visibleTabs.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + "/");
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="flex flex-col items-center gap-0.5 py-1 min-w-0 flex-1"
          >
            <tab.icon
              className="h-5 w-5"
              style={{ color: active ? "#D4930A" : "#64748B" }}
            />
            <span
              className="text-[12px] font-medium"
              style={{ color: active ? "#D4930A" : "#64748B" }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
