import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Table2, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

  // Hide on mobile — bottom tab bar is used instead
  if (isMobile) return null;

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen flex-col text-white transition-all duration-200
        w-16 lg:w-60"
      style={{ backgroundColor: "#0F2A47" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 lg:px-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg font-heading text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: "#D4930A" }}
        >
          TQ
        </div>
        <span className="font-heading text-base font-semibold tracking-tight hidden lg:block">
          Tiavda QMS
        </span>
      </div>

      {/* Nav */}
      <nav className="mt-2 flex-1 space-y-1 px-2 lg:px-3">
        {navItems.map((item) => {
          const active = pathname === item.path || pathname.startsWith(item.path + "/");
          const linkContent = (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors duration-150",
                active
                  ? "border-l-[3px] bg-white/10"
                  : "border-l-[3px] border-transparent hover:bg-white/[0.06]"
              )}
              style={active ? { borderLeftColor: "#D4930A" } : undefined}
            >
              <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </Link>
          );

          // On tablet (collapsed), show tooltip
          return (
            <Tooltip key={item.path} delayDuration={0}>
              <TooltipTrigger asChild>
                {linkContent}
              </TooltipTrigger>
              <TooltipContent side="right" className="lg:hidden">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t px-3 py-4 lg:px-4" style={{ borderTopColor: "rgba(255,255,255,0.1)" }}>
        <p className="mb-2 truncate text-xs hidden lg:block" style={{ color: "rgba(255,255,255,0.5)" }}>
          {user?.email}
        </p>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm transition-colors hover:text-white"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden lg:inline">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
