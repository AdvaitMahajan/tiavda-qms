import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { relativeTime } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CalendarClock, UserPlus, CheckCircle, FolderX,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Notification = Tables<"notifications">;

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/enquiries": "Enquiries",
  "/clients": "Clients",
  "/rate-matrix": "Rate Matrix",
  "/settings": "Settings",
};

const pageBreadcrumbs: Record<string, string[]> = {
  "/dashboard": ["Home", "Dashboard"],
  "/enquiries": ["Home", "Enquiries"],
  "/clients": ["Home", "Clients"],
  "/rate-matrix": ["Home", "Rate Matrix"],
  "/settings": ["Home", "Settings"],
};

function getNotifIcon(type: string) {
  switch (type) {
    case "follow_up_due": return <CalendarClock style={{ width: "14px", height: "14px" }} className="text-amber-500" />;
    case "job_reminder": return <Bell style={{ width: "14px", height: "14px" }} className="text-red-500" />;
    case "intake_received": return <UserPlus style={{ width: "14px", height: "14px" }} className="text-blue-600" />;
    case "payment_received": return <CheckCircle style={{ width: "14px", height: "14px" }} className="text-green-600" />;
    case "drive_folder_failed": return <FolderX style={{ width: "14px", height: "14px" }} className="text-red-600" />;
    default: return <Bell style={{ width: "14px", height: "14px" }} className="text-muted-foreground" />;
  }
}

export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bellBounce, setBellBounce] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const title =
    pageTitles[pathname] ??
    (pathname.startsWith("/enquiries/") ? "Enquiry Detail" :
    pathname.startsWith("/clients/") ? "Client Detail" : "Page");

  const breadcrumbs =
    pageBreadcrumbs[pathname] ??
    (pathname.startsWith("/enquiries/") ? ["Home", "Enquiries", "Detail"] :
    pathname.startsWith("/clients/") ? ["Home", "Clients", "Detail"] : ["Home", title]);

  const userInitial = user?.email ? user.email[0].toUpperCase() : "U";

  // Unread count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notif-count"],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      return count ?? 0;
    },
    enabled: !!user,
  });

  // Notifications list (only when dropdown open)
  const { data: notifications = [], refetch: refetchNotifs } = useQuery({
    queryKey: ["notif-list"],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!user && open,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["notif-count"] });
        if (open) refetchNotifs();
        setBellBounce(true);
        setTimeout(() => setBellBounce(false), 600);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient, open, refetchNotifs]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    queryClient.invalidateQueries({ queryKey: ["notif-count"] });
    refetchNotifs();
  };

  const handleClickNotif = async (notif: Notification) => {
    if (!notif.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", notif.id);
      queryClient.invalidateQueries({ queryKey: ["notif-count"] });
    }
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  return (
    <header
      className="flex h-14 items-center justify-between px-6 bg-white"
      style={{
        borderBottom: "1px solid #E0E7EF",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span style={{ color: "#E0E7EF", fontSize: "12px" }}>/</span>
            )}
            <span
              style={{
                color: i === breadcrumbs.length - 1 ? "#0A1929" : "#546E7A",
                fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                fontSize: "13px",
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <div className="relative" ref={dropdownRef}>
          <motion.button
            onClick={() => { setOpen(!open); if (!open) refetchNotifs(); }}
            className="relative flex items-center justify-center"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#F0F4F8",
            }}
            animate={bellBounce ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 10 }}
          >
            <Bell style={{ width: "16px", height: "16px", color: "#546E7A" }} />
            {unreadCount > 0 && (
              <span
                className="absolute flex items-center justify-center text-white font-bold"
                style={{
                  top: "-4px",
                  right: "-4px",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #FF8F00, #FFB300)",
                  fontSize: "9px",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 z-50 overflow-hidden"
                style={{
                  width: "380px",
                  background: "#FFFFFF",
                  border: "1px solid #E0E7EF",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
                  borderRadius: "14px",
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid #E0E7EF" }}
                >
                  <span className="font-semibold text-sm" style={{ color: "#0A1929" }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs transition-colors"
                      style={{ color: "#1565C0" }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-[420px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm font-medium" style={{ color: "#00897B" }}>You're all caught up! ✓</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleClickNotif(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors last:border-0"
                        style={{ borderBottom: "1px solid rgba(224,231,239,0.5)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        {/* Unread dot */}
                        <div className="flex-shrink-0 pt-1.5">
                          {!n.read ? (
                            <span className="block w-2 h-2 rounded-full" style={{ background: "#1565C0" }} />
                          ) : (
                            <span className="block w-2 h-2" />
                          )}
                        </div>
                        {/* Icon */}
                        <div className="flex-shrink-0 pt-0.5">{getNotifIcon(n.type)}</div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "#0A1929" }}>{n.title}</p>
                          <p className="text-xs line-clamp-2" style={{ color: "#546E7A" }}>{n.body}</p>
                        </div>
                        {/* Time */}
                        <span className="text-[11px] flex-shrink-0 pt-0.5" style={{ color: "#546E7A" }}>
                          {relativeTime(n.created_at)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User avatar */}
        <div
          className="flex items-center justify-center font-bold text-white text-xs"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #1565C0 0%, #2979FF 100%)",
            flexShrink: 0,
          }}
        >
          {userInitial}
        </div>
      </div>
    </header>
  );
}
