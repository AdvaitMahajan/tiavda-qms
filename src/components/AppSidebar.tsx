import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Users, CalendarClock, Settings, LogOut, ClipboardList, Truck, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/clients", label: "Clients", icon: Users },
  { path: "/enquiries", label: "Enquiries", icon: FileText },
  { path: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { path: "/mobilisation", label: "Mobilisation", icon: Truck },
  { path: "/accounts", label: "Accounts", icon: Wallet },
  { path: "/quotation-config", label: "Quotation Config", icon: ClipboardList, adminOnly: true },
  { path: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { user, signOut, profileLoading } = useAuth();
  const { isAdmin } = useRole();
  const visibleItems = navItems.filter((item) => !item.adminOnly || profileLoading || isAdmin);

  return (
    <aside
      className="fixed left-0 top-0 z-30 hidden md:flex h-screen flex-col transition-all duration-200 w-16 lg:w-60"
      style={{ background: "linear-gradient(180deg, #0A1929 0%, #0F2A47 100%)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 lg:px-5 border-b" style={{ borderBottomColor: "rgba(255,255,255,0.08)" }}>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white flex-shrink-0 text-sm"
          style={{ background: "linear-gradient(135deg, #1565C0 0%, #2979FF 100%)", boxShadow: "0 4px 12px rgba(21,101,192,0.4)" }}
        >
          GG
        </div>
        <div className="hidden lg:block min-w-0">
          <span className="block font-bold text-white text-sm leading-tight" style={{ fontFamily: "Sora, sans-serif" }}>
            Global Geo
          </span>
          <span className="block text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
            Consultancy
          </span>
        </div>
      </div>

      {/* Nav label */}
      <div className="hidden lg:block px-5 pt-5 pb-2">
        <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          Main Menu
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2 lg:px-3 pt-2 lg:pt-0">
        {visibleItems.map((item) => {
          const active = pathname === item.path || pathname.startsWith(item.path + "/");
          const linkContent = (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 relative"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, rgba(21,101,192,0.25) 0%, rgba(41,121,255,0.15) 100%)",
                      color: "white",
                      borderLeft: "3px solid #FF8F00",
                      paddingLeft: "13px",
                      paddingRight: "12px",
                    }
                  : {
                      color: "rgba(255,255,255,0.6)",
                      paddingLeft: "16px",
                      paddingRight: "12px",
                    }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
                }
              }}
            >
              <item.icon style={{ width: "18px", height: "18px", flexShrink: 0 }} />
              <span className="hidden lg:block">{item.label}</span>
              {active && (
                <span
                  className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: "#FF8F00" }}
                />
              )}
            </Link>
          );

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
      <div className="px-3 py-4 lg:px-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="hidden lg:flex items-center gap-2 mb-3 px-1">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #1565C0, #2979FF)" }}
          >
            {user?.email ? user.email[0].toUpperCase() : "U"}
          </div>
          <p className="truncate text-[13px] flex-1 min-w-0" style={{ color: "rgba(255,255,255,0.5)" }}>
            {user?.email}
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all"
          style={{ color: "rgba(255,255,255,0.55)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
          }}
        >
          <LogOut style={{ width: "16px", height: "16px" }} />
          <span className="hidden lg:inline">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
