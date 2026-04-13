import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Table2, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/enquiries", label: "Enquiries", icon: FileText },
  { path: "/clients", label: "Clients", icon: Users },
  { path: "/rate-matrix", label: "Rate Matrix", icon: Table2 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col bg-navy text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-heading text-sm font-bold text-card">
          TQ
        </div>
        <span className="font-heading text-base font-semibold tracking-tight">
          Tiavda QMS
        </span>
      </div>

      {/* Nav */}
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = pathname === item.path || pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors",
                active
                  ? "border-l-[3px] border-gold bg-[rgba(255,255,255,0.12)]"
                  : "border-l-[3px] border-transparent hover:bg-[rgba(255,255,255,0.06)]"
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[rgba(255,255,255,0.1)] px-4 py-4">
        <p className="mb-2 truncate text-xs text-[rgba(255,255,255,0.5)]">
          {user?.email}
        </p>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.6)] hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
