import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, CheckCircle } from "lucide-react";

const OUTCOME_COLORS: Record<string, string> = {
  pending: "bg-slate-200 text-slate-700",
  reached: "bg-green-100 text-green-700",
  no_response: "bg-red-100 text-red-700",
  callback_requested: "bg-amber-100 text-amber-700",
  closed: "bg-slate-100 text-slate-600",
};

type Tab = "overdue" | "today" | "upcoming" | "completed";

export default function FollowUps() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("today");
  const today = new Date().toISOString().slice(0, 10);

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["global-follow-ups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("*")
        .order("scheduled_date", { ascending: true });
      if (!data?.length) return { items: [], enquiryMap: new Map(), clientMap: new Map() };

      const enquiryIds = [...new Set(data.map((f) => f.enquiry_id))];
      const { data: enquiries } = await supabase
        .from("enquiries").select("id, ref_number, site_city, client_id")
        .in("id", enquiryIds);
      const clientIds = [...new Set(enquiries?.map((e) => e.client_id) ?? [])];
      const { data: clients } = await supabase
        .from("clients").select("id, name")
        .in("id", clientIds);

      const enquiryMap = new Map(enquiries?.map((e) => [e.id, e]) ?? []);
      const clientMap = new Map(clients?.map((c) => [c.id, c]) ?? []);
      return { items: data, enquiryMap, clientMap };
    },
  });

  const items = followUps?.items ?? [];
  const enquiryMap = followUps?.enquiryMap ?? new Map();
  const clientMap = followUps?.clientMap ?? new Map();

  const overdue = items.filter((f) => f.outcome === "pending" && f.scheduled_date < today);
  const todayItems = items.filter((f) => f.outcome === "pending" && f.scheduled_date === today);
  const upcoming = items.filter((f) => f.outcome === "pending" && f.scheduled_date > today);
  const completed = items.filter((f) => f.outcome !== "pending");

  const tabDefs: { key: Tab; label: string; count: number }[] = [
    { key: "overdue", label: "Overdue", count: overdue.length },
    { key: "today", label: "Today", count: todayItems.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "completed", label: "Completed", count: completed.length },
  ];

  const activeList =
    tab === "overdue" ? overdue
      : tab === "today" ? todayItems
        : tab === "upcoming" ? upcoming
          : completed;

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="font-bold text-2xl"
          style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
        >
          Follow-ups
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#546E7A" }}>
          All follow-ups across enquiries
        </p>
      </div>

      <div className="flex items-center gap-2">
        {tabDefs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition-all"
            style={{
              background: tab === t.key ? "#0F2A47" : "#F0F4F8",
              color: tab === t.key ? "#FFFFFF" : "#546E7A",
            }}
          >
            {t.label}
            <span
              className="rounded-full px-1.5 py-0.5 text-[12px] font-bold"
              style={{
                background: tab === t.key ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                color: tab === t.key ? "#FFFFFF" : "#546E7A",
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : activeList.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle className="h-12 w-12 mb-3" style={{ color: "#00897B" }} />
          <p className="text-sm font-medium" style={{ color: "#0A1929" }}>
            {tab === "overdue" ? "No overdue follow-ups!" : tab === "today" ? "All caught up for today!" : tab === "upcoming" ? "No upcoming follow-ups." : "No completed follow-ups yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeList.map((f) => {
            const enq = enquiryMap.get(f.enquiry_id);
            const cli = enq ? clientMap.get(enq.client_id) : null;
            const isOverdue = f.outcome === "pending" && f.scheduled_date < today;
            return (
              <div
                key={f.id}
                className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all hover:shadow-md"
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${isOverdue ? "#FCA5A5" : "#E0E7EF"}`,
                }}
                onClick={() => navigate(`/enquiries/${f.enquiry_id}`)}
              >
                <div
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    width: "36px", height: "36px",
                    background: isOverdue ? "#FEF2F2" : "#FFF3E0",
                  }}
                >
                  <CalendarClock
                    className="h-4 w-4"
                    style={{ color: isOverdue ? "#C62828" : "#E65100" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[13px]" style={{ color: "#546E7A" }}>
                      {enq?.ref_number ?? "—"}
                    </span>
                    <span className="font-semibold text-sm truncate" style={{ color: "#0A1929" }}>
                      {cli?.name ?? "Unknown"}
                    </span>
                    <Badge className={OUTCOME_COLORS[f.outcome] ?? ""} variant="secondary">
                      {f.outcome.replace("_", " ")}
                    </Badge>
                  </div>
                  {f.notes && (
                    <p className="text-[13px] truncate" style={{ color: "#546E7A" }}>
                      {f.notes}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: isOverdue ? "#C62828" : "#546E7A" }}
                  >
                    {formatDate(f.scheduled_date)}
                  </p>
                  {enq?.site_city && (
                    <p className="text-[12px]" style={{ color: "#94A3B8" }}>
                      {enq.site_city}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
