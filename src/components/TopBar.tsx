import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { relativeTime } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CalendarClock, UserPlus, CheckCircle, FolderX, UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Notification = Tables<"notifications">;

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/enquiries": "Enquiries",
  "/follow-ups": "Follow-ups",
  "/clients": "Clients",
  "/accounts": "Accounts",
  "/quotation-config": "Quotation Config",
  "/settings": "Settings",
};

const pageBreadcrumbs: Record<string, string[]> = {
  "/dashboard": ["Home", "Dashboard"],
  "/enquiries": ["Home", "Enquiries"],
  "/follow-ups": ["Home", "Follow-ups"],
  "/clients": ["Home", "Clients"],
  "/accounts": ["Home", "Accounts"],
  "/quotation-config": ["Home", "Quotation Config"],
  "/settings": ["Home", "Settings"],
};

// ─── Notification type config ─────────────────────────────────────────────────

const typeConfig: Record<string, { icon: LucideIcon; bg: string; color: string }> = {
  follow_up_due:    { icon: CalendarClock, bg: "#FFF3E0", color: "#E65100" },
  job_reminder_1day: { icon: Bell,          bg: "#FEF2F2", color: "#C62828" },
  job_reminder_2day: { icon: Bell,          bg: "#FFF3E0", color: "#E65100" },
  job_reminder_3day: { icon: Bell,          bg: "#FFFDE0", color: "#F59E0B" },
  // legacy key still used in DB
  job_reminder:      { icon: Bell,          bg: "#FEF2F2", color: "#C62828" },
  intake_received:   { icon: UserPlus,      bg: "#EBF2FF", color: "#1565C0" },
  assignment:        { icon: UserCheck,     bg: "#EDE7F6", color: "#7B1FA2" },
  payment_received:  { icon: CheckCircle,   bg: "#E8F5E9", color: "#00897B" },
  drive_folder_failed: { icon: FolderX,     bg: "#FEF2F2", color: "#C62828" },
};

const DEFAULT_CONFIG = { icon: Bell, bg: "#F1F5F9", color: "#546E7A" };

// ─── Component ────────────────────────────────────────────────────────────────

export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bellBounce, setBellBounce] = useState(false);
  const [bellHover, setBellHover] = useState(false);
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

  // ── Unread count ──
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

  // ── Notifications list (only when dropdown open) ──
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

  // ── Realtime subscription ──
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

  // ── Click outside to close ──
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
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
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
              <span style={{ color: "#E0E7EF", fontSize: "13px" }}>/</span>
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

        {/* ── Notification bell ── */}
        <div className="relative" ref={dropdownRef}>
          <motion.button
            onClick={() => { setOpen(!open); if (!open) refetchNotifs(); }}
            onMouseEnter={() => setBellHover(true)}
            onMouseLeave={() => setBellHover(false)}
            animate={bellBounce ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 10 }}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: bellHover ? "#E3EAF2" : "#F0F4F8",
              border: "1px solid #E0E7EF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
              transition: "background 150ms",
            }}
          >
            <Bell style={{ width: "16px", height: "16px", color: "#546E7A" }} />

            {/* Unread badge */}
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #FF8F00, #FFB300)",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid white",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </motion.button>

          {/* ── Dropdown panel ── */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 z-50"
                style={{
                  width: "min(380px, calc(100vw - 32px))",
                  padding: 0,
                  background: "white",
                  borderRadius: "16px",
                  border: "1px solid #E0E7EF",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: "16px 20px",
                    background: "linear-gradient(135deg, #0A1929, #1565C0)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Bell style={{ width: "16px", height: "16px", color: "white" }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "white" }}>
                      Notifications
                    </span>
                  </div>
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.6)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "color 150ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "white"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
                  >
                    Mark all read
                  </button>
                </div>

                {/* List */}
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "40px 20px", textAlign: "center" }}>
                      <Bell
                        style={{
                          width: "32px",
                          height: "32px",
                          color: "#CBD5E1",
                          display: "block",
                          margin: "0 auto",
                        }}
                      />
                      <p style={{ fontSize: "14px", fontWeight: 600, color: "#546E7A", marginTop: "12px" }}>
                        You're all caught up!
                      </p>
                      <p style={{ fontSize: "13px", color: "#94A3B8", marginTop: "4px" }}>
                        No new notifications
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const isUnread = !n.read;
                      const cfg = typeConfig[n.type] ?? DEFAULT_CONFIG;
                      const IconComp = cfg.icon;
                      return (
                        <NotifItem
                          key={n.id}
                          n={n}
                          isUnread={isUnread}
                          cfg={cfg}
                          IconComp={IconComp}
                          onClick={() => handleClickNotif(n)}
                        />
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: "12px 20px",
                    borderTop: "1px solid #F0F4F8",
                    background: "#F8FAFC",
                    textAlign: "center",
                  }}
                >
                  <button
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#1565C0",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    onClick={() => setOpen(false)}
                  >
                    View all notifications
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User avatar */}
        <div
          className="flex items-center justify-center font-bold text-white text-[13px]"
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

// ─── NotifItem sub-component ──────────────────────────────────────────────────

function NotifItem({
  n,
  isUnread,
  cfg,
  IconComp,
  onClick,
}: {
  n: Notification;
  isUnread: boolean;
  cfg: { bg: string; color: string };
  IconComp: LucideIcon;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 20px",
        borderBottom: "1px solid #F8FAFC",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        cursor: "pointer",
        transition: "background 150ms",
        background: hovered ? "#F8FAFC" : isUnread ? "#FAFBFF" : "white",
      }}
    >
      {/* Icon tile */}
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: cfg.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "2px",
        }}
      >
        <IconComp style={{ width: "14px", height: "14px", color: cfg.color }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: isUnread ? "#0A1929" : "#546E7A",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {n.title}
        </div>
        <div
          style={{
            fontSize: "13px",
            marginTop: "2px",
            color: "#546E7A",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {n.body}
        </div>
      </div>

      {/* Right: dot + time */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        {isUnread && (
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#1565C0",
            }}
          />
        )}
        <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "4px" }}>
          {relativeTime(n.created_at)}
        </div>
      </div>
    </div>
  );
}
