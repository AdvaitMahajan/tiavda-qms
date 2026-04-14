import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, relativeTime } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  FileText, Send, CalendarClock, CreditCard, Briefcase,
  CheckCircle, Bell, Activity, Hammer, Receipt,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

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

// ─── Stat cards query ───

const STAT_CARD_DEFS = [
  { label: "New Enquiries", icon: FileText, bgClass: "bg-blue-50", iconClass: "text-blue-500", accentClass: "bg-blue-400" },
  { label: "Quotes Sent", icon: Send, bgClass: "bg-indigo-50", iconClass: "text-indigo-500", accentClass: "bg-indigo-400" },
  { label: "Follow-ups Today", icon: CalendarClock, bgClass: "bg-amber-50", iconClass: "text-amber-500", accentClass: "bg-amber-400" },
  { label: "Payments Pending", icon: CreditCard, bgClass: "bg-yellow-50", iconClass: "text-yellow-500", accentClass: "bg-yellow-400" },
  { label: "Active Jobs", icon: Briefcase, bgClass: "bg-green-50", iconClass: "text-green-500", accentClass: "bg-green-400" },
];

const PIPELINE_PILL_CLASSES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-blue-100 text-blue-700 border-blue-200",
  sent: "bg-indigo-100 text-indigo-700 border-indigo-200",
  follow_up: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-purple-100 text-purple-700 border-purple-200",
  confirmed: "bg-green-100 text-green-700 border-green-200",
  lost: "bg-red-100 text-red-700 border-red-200",
  completed: "bg-teal-100 text-teal-700 border-teal-200",
};

function useStatCards() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [r1, r2, r3, r4, r5] = await Promise.all([
        supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new").is("deleted_at", null),
        supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "sent").is("deleted_at", null),
        supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("scheduled_date", today).eq("outcome", "pending"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "request_sent"),
        supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "confirmed").is("deleted_at", null),
      ]);
      return [r1.count ?? 0, r2.count ?? 0, r3.count ?? 0, r4.count ?? 0, r5.count ?? 0];
    },
  });
}

// ─── Pipeline strip query ───

type LeadStatus = "new" | "pending" | "sent" | "follow_up" | "approved" | "confirmed" | "lost" | "completed";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New", pending: "Pending", sent: "Sent", follow_up: "Follow Up",
  approved: "Approved", confirmed: "Confirmed", lost: "Lost", completed: "Completed",
};
const ALL_STATUSES: LeadStatus[] = ["new", "pending", "sent", "follow_up", "approved", "confirmed", "lost", "completed"];

function usePipelineCounts() {
  return useQuery({
    queryKey: ["dashboard-pipeline"],
    queryFn: async () => {
      const { data } = await supabase.from("enquiries").select("status").is("deleted_at", null);
      const counts: Record<string, number> = {};
      data?.forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
      return ALL_STATUSES.map((s) => ({ status: s, count: counts[s] ?? 0 }));
    },
  });
}

// ─── Today's actions ───

interface ActionItem {
  id: string; enquiry_id: string; ref_number: string; client_name: string;
  site_city: string; scheduled_date: string; notes: string | null;
}

function useTodaysActions() {
  return useQuery({
    queryKey: ["dashboard-actions"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: followUps } = await supabase
        .from("follow_ups").select("id, scheduled_date, notes, enquiry_id")
        .lte("scheduled_date", today).eq("outcome", "pending")
        .order("scheduled_date", { ascending: true }).limit(10);
      if (!followUps?.length) return [];
      const enquiryIds = [...new Set(followUps.map((f) => f.enquiry_id))];
      const { data: enquiries } = await supabase.from("enquiries").select("id, ref_number, site_city, client_id").in("id", enquiryIds);
      const clientIds = [...new Set(enquiries?.map((e) => e.client_id) ?? [])];
      const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const enqMap = new Map(enquiries?.map((e) => [e.id, e]) ?? []);
      const cliMap = new Map(clients?.map((c) => [c.id, c]) ?? []);
      return followUps.map((f): ActionItem => {
        const enq = enqMap.get(f.enquiry_id);
        const cli = enq ? cliMap.get(enq.client_id) : null;
        return { id: f.id, enquiry_id: f.enquiry_id, ref_number: enq?.ref_number ?? "", client_name: cli?.name ?? "Unknown", site_city: enq?.site_city ?? "", scheduled_date: f.scheduled_date, notes: f.notes };
      });
    },
  });
}

// ─── Job reminders ───

interface ReminderItem {
  id: string; enquiry_id: string; ref_number: string; client_name: string;
  reminder_type: string; days_before: number; scheduled_for: string;
}

function useJobReminders() {
  return useQuery({
    queryKey: ["dashboard-reminders"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 3);
      const future = futureDate.toISOString().slice(0, 10);
      const { data: reminders } = await supabase.from("job_reminders")
        .select("id, reminder_type, days_before, scheduled_for, target_date, enquiry_id, job_id")
        .gte("scheduled_for", today).lte("scheduled_for", future).eq("sent", false)
        .order("scheduled_for", { ascending: true }).limit(8);
      if (!reminders?.length) return [];
      const enquiryIds = [...new Set(reminders.map((r) => r.enquiry_id))];
      const { data: enquiries } = await supabase.from("enquiries").select("id, ref_number, client_id").in("id", enquiryIds);
      const clientIds = [...new Set(enquiries?.map((e) => e.client_id) ?? [])];
      const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const enqMap = new Map(enquiries?.map((e) => [e.id, e]) ?? []);
      const cliMap = new Map(clients?.map((c) => [c.id, c]) ?? []);
      return reminders.map((r): ReminderItem => {
        const enq = enqMap.get(r.enquiry_id);
        const cli = enq ? cliMap.get(enq.client_id) : null;
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const diffDays = Math.max(0, Math.round((new Date(r.scheduled_for).getTime() - t.getTime()) / 86400000));
        return { id: r.id, enquiry_id: r.enquiry_id, ref_number: enq?.ref_number ?? "", client_name: cli?.name ?? "Unknown", reminder_type: r.reminder_type, days_before: diffDays, scheduled_for: r.scheduled_for };
      });
    },
  });
}

// ─── Revenue chart ───

interface RevenueMonth { month: string; label: string; count: number; revenue: number; }

function useRevenueChart() {
  return useQuery({
    queryKey: ["dashboard-revenue"],
    queryFn: async () => {
      const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const since = sixMonthsAgo.toISOString().slice(0, 10);
      const { data: enquiries } = await supabase.from("enquiries").select("id, confirmed_date").gte("confirmed_date", since).in("status", ["confirmed", "completed"]);
      if (!enquiries?.length) return [];
      const enqIds = enquiries.map((e) => e.id);
      const { data: quotes } = await supabase.from("quotations").select("enquiry_id, total_amount").eq("status", "approved").in("enquiry_id", enqIds);
      const quoteMap = new Map(quotes?.map((q) => [q.enquiry_id, Number(q.total_amount)]) ?? []);
      const monthMap = new Map<string, { count: number; revenue: number }>();
      for (const e of enquiries) {
        if (!e.confirmed_date) continue;
        const d = new Date(e.confirmed_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const existing = monthMap.get(key) ?? { count: 0, revenue: 0 };
        existing.count++; existing.revenue += quoteMap.get(e.id) ?? 0;
        monthMap.set(key, existing);
      }
      const months: RevenueMonth[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short" });
        const data = monthMap.get(key) ?? { count: 0, revenue: 0 };
        months.push({ month: key, label, ...data });
      }
      return months;
    },
  });
}

// ─── Activity feed ───

interface ActivityItem {
  id: string; event_type: string; from_status: string | null; to_status: string | null;
  created_at: string; ref_number: string; enquiry_id: string; client_name: string;
}

function useActivityFeed() {
  return useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const { data: events } = await supabase.from("enquiry_events").select("id, event_type, from_status, to_status, created_at, enquiry_id").order("created_at", { ascending: false }).limit(15);
      if (!events?.length) return [];
      const enquiryIds = [...new Set(events.map((e) => e.enquiry_id))];
      const { data: enquiries } = await supabase.from("enquiries").select("id, ref_number, client_id").in("id", enquiryIds);
      const clientIds = [...new Set(enquiries?.map((e) => e.client_id) ?? [])];
      const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const enqMap = new Map(enquiries?.map((e) => [e.id, e]) ?? []);
      const cliMap = new Map(clients?.map((c) => [c.id, c]) ?? []);
      return events.map((ev): ActivityItem => {
        const enq = enqMap.get(ev.enquiry_id);
        const cli = enq ? cliMap.get(enq.client_id) : null;
        return { id: ev.id, event_type: ev.event_type, from_status: ev.from_status, to_status: ev.to_status, created_at: ev.created_at, ref_number: enq?.ref_number ?? "", enquiry_id: ev.enquiry_id, client_name: cli?.name ?? "Unknown" };
      });
    },
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
    case "status_change": return "bg-blue-500";
    case "quotation_approved": return "bg-purple-500";
    case "payment_received": return "bg-green-500";
    case "job_completed": return "bg-teal-500";
    default: return "bg-slate-400";
  }
}

function RevenueTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as RevenueMonth;
  return (
    <div className="bg-card border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold">{d.label}</p>
      <p className="text-muted-foreground">{d.count} enquiries</p>
      <p className="font-medium" style={{ color: "hsl(var(--navy))" }}>{formatCurrency(d.revenue)}</p>
    </div>
  );
}

// ─── Main Dashboard ───

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stats = useStatCards();
  const pipeline = usePipelineCounts();
  const actions = useTodaysActions();
  const reminders = useJobReminders();
  const revenue = useRevenueChart();
  const activity = useActivityFeed();

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "enquiry_events" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-pipeline"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const thisMonthRevenue = useMemo(() => {
    if (!revenue.data?.length) return 0;
    return revenue.data[revenue.data.length - 1].revenue;
  }, [revenue.data]);

  return (
    <div className="space-y-6">
      <h1 className="font-sora text-[1.875rem] font-bold" style={{ color: "#0F2A47" }}>Dashboard</h1>

      {/* ── Section 1: Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.isLoading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : STAT_CARD_DEFS.map((def, i) => {
              const Icon = def.icon;
              const value = stats.data?.[i] ?? 0;
              return (
                <div
                  key={def.label}
                  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">{def.label}</span>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${def.bgClass}`}>
                      <Icon className={`w-5 h-5 ${def.iconClass}`} />
                    </div>
                  </div>
                  <div className="text-4xl font-bold text-[#0F2A47]" style={{ fontFamily: "Sora, sans-serif" }}>
                    <AnimatedNumber value={value} />
                  </div>
                  <div className={`h-1 rounded-full ${def.accentClass} opacity-60`} />
                </div>
              );
            })}
      </div>

      {/* ── Section 2: Pipeline Strip ── */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
        {pipeline.isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-full flex-shrink-0" />)
          : ALL_STATUSES.map((status) => {
              const count = pipeline.data?.find((p) => p.status === status)?.count ?? 0;
              return (
                <button
                  key={status}
                  onClick={() => navigate("/enquiries")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition-all hover:scale-105 ${PIPELINE_PILL_CLASSES[status]}`}
                >
                  <span>{STATUS_LABELS[status]}</span>
                  <span className="bg-white bg-opacity-60 rounded-full px-1.5 py-0.5 text-xs font-bold">{count}</span>
                </button>
              );
            })}
      </div>

      {/* ── Section 3: Two column row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Today's Actions — 2/3 */}
        <Card className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              <h2 className="font-sora text-lg font-semibold" style={{ color: "#0F2A47" }}>Today's Actions</h2>
            </div>
            {actions.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
            ) : !actions.data?.length ? (
              <div className="flex flex-col items-center py-10 text-center">
                <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">All caught up! No follow-ups due today.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {actions.data.map((item) => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const isOverdue = new Date(item.scheduled_date) < today;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/enquiries/${item.enquiry_id}`)}>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{item.ref_number}</span>
                          <span className="font-semibold text-sm truncate">{item.client_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.site_city}</p>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {new Date(item.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job Reminders — 1/3 */}
        <Card className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-red-500" />
              <h2 className="font-sora text-lg font-semibold" style={{ color: "#0F2A47" }}>Upcoming Reminders</h2>
            </div>
            {reminders.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
            ) : !reminders.data?.length ? (
              <p className="text-sm text-muted-foreground text-center py-10">No upcoming reminders.</p>
            ) : (
              <div className="space-y-1">
                {reminders.data.map((item) => {
                  const RIcon = item.reminder_type === "site" ? Hammer : item.reminder_type === "report" ? FileText : Receipt;
                  const dotColor = item.days_before <= 1 ? "bg-red-500" : item.days_before === 2 ? "bg-amber-500" : "bg-yellow-500";
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/enquiries/${item.enquiry_id}`)}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                      <RIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-muted-foreground">{item.ref_number}</span>
                        <p className="text-sm truncate">{item.client_name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {item.days_before === 0 ? "Today" : `in ${item.days_before}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4: Revenue Chart ── */}
      <Card className="rounded-2xl shadow-sm border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sora text-lg font-semibold" style={{ color: "#0F2A47" }}>
              Confirmed Revenue — Last 6 Months
            </h2>
            {thisMonthRevenue > 0 && (
              <span className="font-sora font-bold text-lg" style={{ color: "#0F2A47" }}>
                {formatCurrency(thisMonthRevenue)}
              </span>
            )}
          </div>
          {revenue.isLoading ? (
            <Skeleton className="h-[300px] w-full rounded-lg" />
          ) : !revenue.data?.some((m) => m.revenue > 0) ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center">
              <p className="text-sm text-muted-foreground">No confirmed revenue yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenue.data} barSize={40}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis hide />
                <Tooltip content={<RevenueTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {revenue.data?.map((_, i) => (
                    <Cell key={i} fill="#0F2A47" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Section 5: Activity Feed ── */}
      <Card className="rounded-2xl shadow-sm border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-sora text-lg font-semibold" style={{ color: "#0F2A47" }}>Recent Activity</h2>
          </div>
          {activity.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : !activity.data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-10">
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
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/enquiries/${ev.enquiry_id}`)}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getEventColor(ev)}`} />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm">{getEventDescription(ev)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{ev.client_name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground flex-shrink-0">{ev.ref_number}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{relativeTime(ev.created_at)}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
