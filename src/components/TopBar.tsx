import { useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/enquiries": "Enquiries",
  "/clients": "Clients",
  "/rate-matrix": "Rate Matrix",
  "/settings": "Settings",
};

export function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const title =
    pageTitles[pathname] ??
    (pathname.startsWith("/enquiries/") ? "Enquiry Detail" :
    pathname.startsWith("/clients/") ? "Client Detail" : "Page");

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "U";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <div className="flex items-center gap-4">
        <button className="relative text-muted hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red text-[10px] font-bold text-card">
            0
          </span>
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue text-xs font-semibold text-card">
          {initials}
        </div>
      </div>
    </header>
  );
}
