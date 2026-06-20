import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { formatCurrency, relativeTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  FileText, Send, CalendarClock, CreditCard, Briefcase,
  CheckCircle, Bell, Activity, Hammer, Receipt,
  Plus, Users, Settings, TrendingUp, IndianRupee, ClipboardList, BarChart3, ClipboardCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Animated counter ───

function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Counter target={value} />
    </motion.span>
  );
}

function Counter({ target }: { target: number }) {
  const ref = (el: HTMLSpanElement | null) => {
    if (!el) return;
    let start = 0;
    const duration = 1500;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      el.textContent = start.toLocaleString("en-IN");
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  return <span ref={ref}>0</span>;
}

// ─── Stat card definitions ───

const STAT_CARD_DEFS = [
  {
    label: "New Enquiries",
    icon: FileText,
    gradient: "linear-gradient(90deg,#1565C0,#2979FF)",
    iconBg: "#EBF2FF",
    iconColor: "#1565C0",
  },
  {
    label: "Quotes Sent",
    icon: Send,
    gradient: "linear-gradient(90deg,#6A1B9A,#AB47BC)",
    iconBg: "#F3E8FF",
    iconColor: "#6A1B9A",
  },
  {
    label: "Follow-ups Today",
    icon: CalendarClock,
    gradient: "linear-gradient(90deg,#E65100,#FF8F00)",
    iconBg: "#FFF3E0",
    iconColor: "#E65100",
  },
  {
    label: "Payments Pending",
    icon: CreditCard,
    gradient: "linear-gradient(90deg,#FF8F00,#FFB300)",
    iconBg: "#FFFDE0",
    iconColor: "#FF8F00",
  },
  {
    label: "Active Jobs",
    icon: Briefcase,
    gradient: "linear-gradient(90deg,#00897B,#26A69A)",
    iconBg: "#E0F2F1",
    iconColor: "#00897B",
  },
  {
    label: "Conversion %",
    icon: TrendingUp,
    gradient: "linear-gradient(90deg,#15673A,#22C55E)",
    iconBg: "#DCFCE7",
    iconColor: "#15673A",
  },
  {
    label: "Pipeline Value",
    icon: IndianRupee,
    gradient: "linear-gradient(90deg,#7C3AED,#A78BFA)",
    iconBg: "#EDE9FE",
    iconColor: "#7C3AED",
    isCurrency: true,
  },
  {
    label: "Order Book",
    icon: ClipboardList,
    gradient: "linear-gradient(90deg,#0E7490,#22D3EE)",
    iconBg: "#CFFAFE",
    iconColor: "#0E7490",
  },
  {
    label: "Pending Quotes",
    icon: Send,
    gradient: "linear-gradient(90deg,#D97706,#F59E0B)",
    iconBg: "#FEF3C7",
    iconColor: "#D97706",
  },
  {
    label: "Quotation Book",
    icon: IndianRupee,
    gradient: "linear-gradient(90deg,#059669,#34D399)",
    iconBg: "#D1FAE5",
    iconColor: "#059669",
    isCurrency: true,
  },
  {
    label: "Intake Pending",
    icon: ClipboardCheck,
    gradient: "linear-gradient(90deg,#0284C7,#38BDF8)",
    iconBg: "#E0F2FE",
    iconColor: "#0284C7",
    link: "/enquiries",
  },
] as const;

const PIPELINE_PILL_CLASSES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  intake_pending: "bg-sky-100 text-sky-700 border-sky-200",
  pending: "bg-blue-100 text-blue-700 border-blue-200",
  sent: "bg-indigo-100 text-indigo-700 border-indigo-200",
  follow_up: "bg-amber-100 text-amber-700 border-amber-200",
  negotiation: "bg-orange-100 text-orange-700 border-orange-200",
  approved: "bg-purple-100 text-purple-700 border-purple-200",
  payment_received: "bg-violet-100 text-violet-700 border-violet-200",
  mobilization_scheduled: "bg-cyan-100 text-cyan-700 border-cyan-200",
  job_active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  confirmed: "bg-green-100 text-green-700 border-green-200",
  lost: "bg-red-100 text-red-700 border-red-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  completed: "bg-teal-100 text-teal-700 border-teal-200",
};

// ─── Queries ───

function useStatCards() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const d = await apiClient.get<{
        new_enquiries: number; sent_quotes: number; followups_today: number;
        pending_payments: number; active_jobs: number; total_enquiries: number;
        won_enquiries: number; intake_pending: number; pipeline_value: number;
        quotation_book_value: number; order_book: number; pending_quotes: number;
      }>("/dashboard/stats");
      const total = d.total_enquiries;
      const won = d.won_enquiries;
      const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
      return [
        d.new_enquiries, d.sent_quotes, d.followups_today, d.pending_payments, d.active_jobs,
        conversionRate, Math.round(d.pipeline_value), d.order_book, d.pending_quotes,
        Math.round(d.quotation_book_value), d.intake_pending,
      ];
    },
    refetchInterval: 20_000,
  });
}

type LeadStatus = "new" | "intake_pending" | "pending" | "sent" | "follow_up" | "negotiation" | "approved" | "payment_received" | "mobilization_scheduled" | "job_active" | "confirmed" | "lost" | "inactive" | "completed";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New", intake_pending: "Intake Pending", pending: "Quotation Prep", sent: "Quote Sent",
  follow_up: "Follow Up", negotiation: "Negotiation", approved: "Won",
  payment_received: "Payment Recd", mobilization_scheduled: "Mob Scheduled",
  job_active: "Job Active", confirmed: "Confirmed", lost: "Lost", inactive: "Inactive", completed: "Completed",
};
const ALL_STATUSES: LeadStatus[] = [
  "new", "intake_pending", "pending", "sent", "follow_up", "negotiation",
  "approved", "payment_received", "mobilization_scheduled", "job_active",
  "lost", "inactive", "completed",
];

function usePipelineCounts() {
  return useQuery({
    queryKey: ["dashboard-pipeline"],
    queryFn: async () => {
      const rows = await apiClient.get<Array<{ status: string; count: number }>>("/dashboard/pipeline");
      const counts: Record<string, number> = {};
      rows.forEach((r) => { counts[r.status] = r.count; });
      return ALL_STATUSES.map((s) => ({ status: s, count: counts[s] ?? 0 }));
    },
    refetchInterval: 20_000,
  });
}

interface ActionItem {
  id: string; enquiry_id: string; ref_number: string; client_name: string;
  site_city: string; scheduled_date: string; notes: string | null;
}

function useTodaysActions() {
  return useQuery({
    queryKey: ["dashboard-actions"],
    queryFn: async () => {
      const rows = await apiClient.get<Array<{
        id: string; enquiry_id: string; ref_number: string | null; site_city: string | null;
        client_name: string | null; scheduled_date: string; notes: string | null;
      }>>("/dashboard/actions");
      return rows.map((f): ActionItem => ({
        id: f.id, enquiry_id: f.enquiry_id, ref_number: f.ref_number ?? "",
        client_name: f.client_name ?? "Unknown", site_city: f.site_city ?? "",
        scheduled_date: f.scheduled_date, notes: f.notes,
      }));
    },
    refetchInterval: 20_000,
  });
}

interface ReminderItem {
  id: string; enquiry_id: string; ref_number: string; client_name: string;
  reminder_type: string; days_before: number; scheduled_for: string;
}

function useJobReminders() {
  return useQuery({
    queryKey: ["dashboard-reminders"],
    queryFn: async () => {
      const rows = await apiClient.get<Array<{
        id: string; enquiry_id: string; ref_number: string | null; client_name: string | null;
        reminder_type: string; days_before: number; scheduled_for: string;
      }>>("/dashboard/reminders");
      return rows.map((r): ReminderItem => {
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const diffDays = Math.max(0, Math.round((new Date(r.scheduled_for).getTime() - t.getTime()) / 86400000));
        return { id: r.id, enquiry_id: r.enquiry_id, ref_number: r.ref_number ?? "", client_name: r.client_name ?? "Unknown", reminder_type: r.reminder_type, days_before: diffDays, scheduled_for: r.scheduled_for };
      });
    },
    refetchInterval: 20_000,
  });
}


interface ActivityItem {
  id: string; event_type: string; from_status: string | null; to_status: string | null;
  created_at: string; ref_number: string; enquiry_id: string; client_name: string;
}

function useActivityFeed() {
  return useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const rows = await apiClient.get<Array<{
        id: string; event_type: string; from_status: string | null; to_status: string | null;
        created_at: string; enquiry_id: string; ref_number: string | null; client_name: string | null;
      }>>("/dashboard/activity");
      return rows.map((ev): ActivityItem => ({
        id: ev.id, event_type: ev.event_type, from_status: ev.from_status, to_status: ev.to_status,
        created_at: ev.created_at, ref_number: ev.ref_number ?? "", enquiry_id: ev.enquiry_id,
        client_name: ev.client_name ?? "Unknown",
      }));
    },
    refetchInterval: 20_000,
  });
}

function getEventDescription(ev: ActivityItem): string {
  switch (ev.event_type) {
    case "status_change": return `${ev.from_status ?? "—"} → ${ev.to_status ?? "—"}`;
    case "quotation_approved": return "Quotation approved";
    case "quotation_sent": return "Quotation sent to client";
    case "payment_requested": return "Payment request sent";
    case "payment_received": return "Payment received";
    case "mobilisation_scheduled": return "Mobilisation scheduled";
    case "job_completed": return "Job completed 🎉";
    default: return ev.event_type.replace(/_/g, " ");
  }
}

function getEventColor(ev: ActivityItem): string {
  switch (ev.event_type) {
    case "status_change": return "#1565C0";
    case "quotation_approved": return "#6A1B9A";
    case "payment_received": return "#00897B";
    case "job_completed": return "#26A69A";
    default: return "#546E7A";
  }
}


// ─── Main Dashboard ───

export default function Dashboard() {
  const navigate = useNavigate();
  const stats = useStatCards();
  const pipeline = usePipelineCounts();
  const actions = useTodaysActions();
  const reminders = useJobReminders();
  const activity = useActivityFeed();

  const [showAddLead, setShowAddLead] = useState(false);

  const formattedDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const cardStyle = {
    background: "#FFFFFF",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    border: "1px solid #E0E7EF",
    position: "relative" as const,
    overflow: "hidden" as const,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1
          className="font-bold text-3xl"
          style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
        >
          {(() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })()} 👋
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#546E7A" }}>
          Here's what needs your attention today — {formattedDate}
        </p>
      </div>

      {/* ── Section 1: Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.isLoading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : STAT_CARD_DEFS.map((def, i) => {
              const Icon = def.icon;
              const value = stats.data?.[i] ?? 0;
              const isCurrency = "isCurrency" in def && def.isCurrency;
              const isPercentage = def.label === "Conversion %";
              return (
                <div key={def.label} style={cardStyle}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0,
                      height: "4px",
                      background: def.gradient,
                    }}
                  />
                  <div className="flex items-start justify-between mt-1">
                    <div>
                      <p className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#546E7A" }}>
                        {def.label}
                      </p>
                      <div
                        className="font-bold"
                        style={{ fontFamily: "Sora, sans-serif", fontSize: isCurrency ? "28px" : "42px", lineHeight: 1, color: "#0A1929" }}
                      >
                        {isCurrency ? (
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "26px" }}>
                            {formatCurrency(value)}
                          </span>
                        ) : (
                          <>
                            <AnimatedNumber value={value} />
                            {isPercentage && <span style={{ fontSize: "24px", color: "#546E7A" }}>%</span>}
                          </>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex items-center justify-center rounded-xl flex-shrink-0"
                      style={{ width: "44px", height: "44px", background: def.iconBg }}
                    >
                      <Icon style={{ width: "22px", height: "22px", color: def.iconColor }} />
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* ── Section 2: Pipeline Strip ── */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "20px 24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          border: "1px solid #E0E7EF",
        }}
      >
        <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#546E7A" }}>
          Pipeline Overview
        </p>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {pipeline.isLoading
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-full flex-shrink-0" />)
            : ALL_STATUSES.map((status) => {
                const count = pipeline.data?.find((p) => p.status === status)?.count ?? 0;
                return (
                  <button
                    key={status}
                    onClick={() => navigate("/enquiries")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap border transition-all hover:scale-105 ${PIPELINE_PILL_CLASSES[status]}`}
                  >
                    <span>{STATUS_LABELS[status]}</span>
                    <span className="bg-white bg-opacity-60 rounded-full px-1.5 py-0.5 text-[13px] font-bold">{count}</span>
                  </button>
                );
              })}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {[
          { label: "Add Lead", icon: Plus, href: "", gradient: "linear-gradient(90deg,#1565C0,#2979FF)" },
          { label: "Clients", icon: Users, href: "/clients", gradient: "linear-gradient(90deg,#6A1B9A,#AB47BC)" },
          { label: "Quotation Config", icon: BarChart3, href: "/quotation-config", gradient: "linear-gradient(90deg,#E65100,#FF8F00)" },
          { label: "Settings", icon: Settings, href: "/settings", gradient: "linear-gradient(90deg,#546E7A,#78909C)" },
        ].map((qa) => {
          const Icon = qa.icon;
          return (
            <button
              key={qa.label}
              onClick={() => qa.label === "Add Lead" ? setShowAddLead(true) : navigate(qa.href)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold whitespace-nowrap transition-all hover:scale-105 hover:shadow-md"
              style={{ background: qa.gradient }}
            >
              <Icon className="h-4 w-4" />
              {qa.label}
            </button>
          );
        })}
      </div>

      {/* ── Section 3: Two column row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Actions — 2/3 */}
        <div className="lg:col-span-2" style={cardStyle}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ width: "28px", height: "28px", background: "#FFF3E0", flexShrink: 0 }}
            >
              <CalendarClock style={{ width: "14px", height: "14px", color: "#E65100" }} />
            </div>
            <h2 className="font-semibold text-base" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
              Today's Actions
            </h2>
          </div>
          {actions.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : !actions.data?.length ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
              <p className="text-sm" style={{ color: "#546E7A" }}>All caught up! No follow-ups due today.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {actions.data.map((item) => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const isOverdue = new Date(item.scheduled_date) < today;
                return (
                  <ActionRow
                    key={item.id}
                    onClick={() => navigate(`/enquiries/${item.enquiry_id}`)}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px]" style={{ color: "#546E7A" }}>{item.ref_number}</span>
                        <span className="font-semibold text-sm truncate" style={{ color: "#0A1929" }}>{item.client_name}</span>
                      </div>
                      <p className="text-[13px]" style={{ color: "#546E7A" }}>{item.site_city}</p>
                    </div>
                    <span className={`text-[13px] flex-shrink-0 ${isOverdue ? "font-medium" : ""}`} style={{ color: isOverdue ? "#C62828" : "#546E7A" }}>
                      {new Date(item.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </ActionRow>
                );
              })}
            </div>
          )}
        </div>

        {/* Job Reminders — 1/3 */}
        <div style={cardStyle}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ width: "28px", height: "28px", background: "#FCE4EC", flexShrink: 0 }}
            >
              <Bell style={{ width: "14px", height: "14px", color: "#C62828" }} />
            </div>
            <h2 className="font-semibold text-base" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
              Upcoming Reminders
            </h2>
          </div>
          {reminders.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : !reminders.data?.length ? (
            <p className="text-sm text-center py-10" style={{ color: "#546E7A" }}>No upcoming reminders.</p>
          ) : (
            <div className="space-y-1">
              {reminders.data.map((item) => {
                const RIcon = item.reminder_type === "site" ? Hammer : item.reminder_type === "report" ? FileText : Receipt;
                const dotColor = item.days_before <= 1 ? "#C62828" : item.days_before === 2 ? "#E65100" : "#FF8F00";
                return (
                  <ActionRow
                    key={item.id}
                    onClick={() => navigate(`/enquiries/${item.enquiry_id}`)}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                    <RIcon className="h-4 w-4 flex-shrink-0" style={{ color: "#546E7A" }} />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[13px]" style={{ color: "#546E7A" }}>{item.ref_number}</span>
                      <p className="text-sm truncate" style={{ color: "#0A1929" }}>{item.client_name}</p>
                    </div>
                    <span className="text-[13px] flex-shrink-0" style={{ color: "#546E7A" }}>
                      {item.days_before === 0 ? "Today" : `in ${item.days_before}d`}
                    </span>
                  </ActionRow>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Activity Feed ── */}
      <div style={cardStyle}>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5" style={{ color: "#546E7A" }} />
          <h2 className="font-semibold text-base" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
            Recent Activity
          </h2>
        </div>
        {activity.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : !activity.data?.length ? (
          <p className="text-sm text-center py-10" style={{ color: "#546E7A" }}>
            No activity yet. Actions will appear here as you use the system.
          </p>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {activity.data.map((ev) => (
                <motion.div
                  key={ev.id}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  onClick={() => navigate(`/enquiries/${ev.enquiry_id}`)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: getEventColor(ev) }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm" style={{ color: "#0A1929" }}>{getEventDescription(ev)}</span>
                    <span className="text-[13px] ml-2" style={{ color: "#546E7A" }}>{ev.client_name}</span>
                  </div>
                  <span className="font-mono text-[12px] flex-shrink-0" style={{ color: "#546E7A" }}>{ev.ref_number}</span>
                  <span className="text-[13px] flex-shrink-0" style={{ color: "#546E7A" }}>{relativeTime(ev.created_at)}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AddLeadDialog open={showAddLead} onOpenChange={setShowAddLead} />
    </div>
  );
}

// Helper row component with hover state
function ActionRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
      style={{ background: hovered ? "#F8FAFC" : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
