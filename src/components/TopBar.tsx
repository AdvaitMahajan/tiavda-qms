import { useState, useEffect, useRef, useCallback } from "react";
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

function getNotifIcon(type: string) {
  switch (type) {
    case "follow_up_due": return <CalendarClock className="h-4 w-4 text-amber-500" />;
    case "job_reminder": return <Bell className="h-4 w-4 text-red-500" />;
    case "intake_received": return <UserPlus className="h-4 w-4 text-blue-600" />;
    case "payment_received": return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "drive_folder_failed": return <FolderX className="h-4 w-4 text-red-600" />;
    default: return <Bell className="h-4 w-4 text-muted-foreground" />;
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

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "U";

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
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          <motion.button
            onClick={() => { setOpen(!open); if (!open) refetchNotifs(); }}
            className="relative text-muted-foreground hover:text-foreground transition-colors"
            animate={bellBounce ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 10 }}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
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
                className="absolute right-0 top-full mt-2 w-[380px] bg-card border border-border shadow-xl rounded-xl z-50 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="font-semibold text-sm text-foreground">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-[420px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm text-green-600 font-medium">You're all caught up! ✓</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleClickNotif(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors border-b border-border/50 last:border-0"
                      >
                        {/* Unread dot */}
                        <div className="flex-shrink-0 pt-1.5">
                          {!n.read ? (
                            <span className="block w-2 h-2 rounded-full bg-blue-600" />
                          ) : (
                            <span className="block w-2 h-2" />
                          )}
                        </div>
                        {/* Icon */}
                        <div className="flex-shrink-0 pt-0.5">{getNotifIcon(n.type)}</div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                        </div>
                        {/* Time */}
                        <span className="text-[11px] text-muted-foreground flex-shrink-0 pt-0.5">
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

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue text-xs font-semibold text-card">
          {initials}
        </div>
      </div>
    </header>
  );
}
