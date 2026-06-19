import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, CheckCircle2, CreditCard, CalendarCheck, Hammer, MapPin, Phone } from "lucide-react";

type Tab = "won" | "payment_received" | "mob_scheduled" | "job_active";

const TAB_DEFS: { key: Tab; label: string; icon: typeof Truck; color: string; bg: string; status: string }[] = [
  { key: "won", label: "Awaiting Payment", icon: CreditCard, color: "#7C3AED", bg: "#F5F3FF", status: "approved" },
  { key: "payment_received", label: "Ready to Mobilise", icon: Truck, color: "#0891B2", bg: "#ECFEFF", status: "payment_received" },
  { key: "mob_scheduled", label: "Mob Scheduled", icon: CalendarCheck, color: "#059669", bg: "#ECFDF5", status: "mobilization_scheduled" },
  { key: "job_active", label: "Job Active", icon: Hammer, color: "#D97706", bg: "#FFFBEB", status: "job_active" },
];

interface MobRow {
  id: string;
  ref_number: string;
  status: string;
  site_city: string;
  client_name: string;
  client_phone: string;
  quote_amount: number | null;
  confirmed_date: string | null;
  mob_date: string | null;
  mob_time: string | null;
  team_lead_name: string | null;
  service_type: string;
}

function useMobilisationData() {
  return useQuery({
    queryKey: ["mobilisation-queue"],
    queryFn: async (): Promise<MobRow[]> => {
      const statuses = ["approved", "payment_received", "mobilization_scheduled", "job_active"];

      const { data: enquiries, error } = await supabase
        .from("enquiries")
        .select("id, ref_number, status, site_city, client_id, confirmed_date, service_type")
        .in("status", statuses)
        .is("deleted_at", null)
        .order("confirmed_date", { ascending: false });

      if (error) throw error;
      if (!enquiries?.length) return [];

      const clientIds = [...new Set(enquiries.map((e) => e.client_id))];
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, phone")
        .in("id", clientIds);
      const clientMap = new Map(clients?.map((c) => [c.id, c]) ?? []);

      const { data: quotes } = await supabase
        .from("quotations")
        .select("enquiry_id, total_amount")
        .in("status", ["approved", "sent"])
        .in("enquiry_id", enquiries.map((e) => e.id));
      const quoteMap = new Map(quotes?.map((q) => [q.enquiry_id, q.total_amount]) ?? []);

      const { data: mobs } = await supabase
        .from("mobilisation")
        .select("enquiry_id, mobilisation_date, mobilisation_time, team_lead_id")
        .in("enquiry_id", enquiries.map((e) => e.id));
      const mobMap = new Map(mobs?.map((m) => [m.enquiry_id, m]) ?? []);

      const teamLeadIds = [...new Set(mobs?.map((m) => m.team_lead_id).filter(Boolean) ?? [])];
      let teamMap = new Map<string, string>();
      if (teamLeadIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", teamLeadIds);
        teamMap = new Map(profiles?.map((p) => [p.id, p.full_name ?? "Unknown"]) ?? []);
      }

      return enquiries.map((e) => {
        const client = clientMap.get(e.client_id);
        const mob = mobMap.get(e.id);
        return {
          id: e.id,
          ref_number: e.ref_number,
          status: e.status,
          site_city: e.site_city,
          client_name: client?.name ?? "Unknown",
          client_phone: client?.phone ?? "",
          quote_amount: quoteMap.get(e.id) ?? null,
          confirmed_date: e.confirmed_date,
          mob_date: mob?.mobilisation_date ?? null,
          mob_time: mob?.mobilisation_time ?? null,
          team_lead_name: mob?.team_lead_id ? (teamMap.get(mob.team_lead_id) ?? null) : null,
          service_type: e.service_type,
        };
      });
    },
  });
}

export default function Mobilisation() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("payment_received");
  const { data: rows, isLoading } = useMobilisationData();

  const counts: Record<Tab, number> = {
    won: rows?.filter((r) => r.status === "approved").length ?? 0,
    payment_received: rows?.filter((r) => r.status === "payment_received").length ?? 0,
    mob_scheduled: rows?.filter((r) => r.status === "mobilization_scheduled").length ?? 0,
    job_active: rows?.filter((r) => r.status === "job_active").length ?? 0,
  };

  const currentTabDef = TAB_DEFS.find((t) => t.key === tab)!;
  const activeList = rows?.filter((r) => r.status === currentTabDef.status) ?? [];

  return (
    <div style={{ background: "#F0F4F8" }}>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #0E7490 100%)",
          borderRadius: "20px",
          padding: "28px 32px",
          marginBottom: "24px",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute", width: "300px", height: "300px",
            borderRadius: "50%", background: "rgba(255,255,255,0.04)",
            top: "-100px", right: "-80px", pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 className="font-bold" style={{ fontFamily: "Sora, sans-serif", fontSize: "28px", color: "white" }}>
            Mobilisation
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
            {isLoading ? "Loading…" : `${rows?.length ?? 0} active deals in pipeline`}
          </p>
        </div>
      </div>

      {/* Pipeline tabs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TAB_DEFS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: active ? t.color : "#FFFFFF",
                color: active ? "#FFFFFF" : "#546E7A",
                border: `1px solid ${active ? t.color : "#E0E7EF"}`,
                boxShadow: active ? `0 4px 12px ${t.color}30` : "none",
              }}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span
                className="rounded-full px-2 py-0.5 text-[12px] font-bold"
                style={{
                  background: active ? "rgba(255,255,255,0.25)" : "#F0F4F8",
                  color: active ? "#FFFFFF" : "#0A1929",
                }}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : activeList.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{ width: "64px", height: "64px", background: currentTabDef.bg }}
          >
            <currentTabDef.icon className="h-7 w-7" style={{ color: currentTabDef.color }} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: "#0A1929" }}>
            No enquiries in this stage
          </p>
          <p className="text-[13px]" style={{ color: "#94A3B8" }}>
            {tab === "won" && "Deals will appear here when marked as Won"}
            {tab === "payment_received" && "Mark advance payment as received to move deals here"}
            {tab === "mob_scheduled" && "Schedule mobilisation to move deals here"}
            {tab === "job_active" && "Active jobs will appear here during execution"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeList.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-4 p-5 rounded-xl cursor-pointer transition-all hover:shadow-lg"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E0E7EF",
              }}
              onClick={() => {
                const tabTarget = tab === "won" ? "payments" : tab === "payment_received" ? "mobilisation" : tab === "mob_scheduled" ? "mobilisation" : "job";
                navigate(`/enquiries/${row.id}?tab=${tabTarget}`);
              }}
            >
              {/* Icon */}
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: "44px", height: "44px", background: currentTabDef.bg }}
              >
                <currentTabDef.icon className="h-5 w-5" style={{ color: currentTabDef.color }} />
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[13px] font-semibold" style={{ color: "#1565C0" }}>
                    {row.ref_number}
                  </span>
                  <Badge
                    className="text-[12px] px-1.5"
                    style={{
                      background: row.service_type === "soil_investigation" ? "#DBEAFE" : "#FEF3C7",
                      color: row.service_type === "soil_investigation" ? "#1E40AF" : "#92400E",
                      border: "none",
                    }}
                  >
                    {row.service_type === "soil_investigation" ? "SI" : "Consultancy"}
                  </Badge>
                </div>
                <p className="font-semibold text-sm truncate" style={{ color: "#0A1929" }}>
                  {row.client_name}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[13px]" style={{ color: "#546E7A" }}>
                    <MapPin className="h-3 w-3" /> {row.site_city}
                  </span>
                  {row.client_phone && (
                    <span className="flex items-center gap-1 text-[13px]" style={{ color: "#546E7A" }}>
                      <Phone className="h-3 w-3" /> {row.client_phone}
                    </span>
                  )}
                </div>
              </div>

              {/* Right info */}
              <div className="text-right flex-shrink-0 space-y-1">
                {row.quote_amount && (
                  <p className="font-semibold text-sm" style={{ color: "#0A1929" }}>
                    {formatCurrency(row.quote_amount)}
                  </p>
                )}
                {row.mob_date && (
                  <p className="text-[13px] font-medium" style={{ color: "#059669" }}>
                    Mob: {formatDate(row.mob_date)}
                    {row.mob_time && ` at ${row.mob_time}`}
                  </p>
                )}
                {row.confirmed_date && !row.mob_date && (
                  <p className="text-[13px]" style={{ color: "#94A3B8" }}>
                    Won: {formatDate(row.confirmed_date)}
                  </p>
                )}
                {row.team_lead_name && (
                  <p className="text-[12px]" style={{ color: "#94A3B8" }}>
                    Lead: {row.team_lead_name}
                  </p>
                )}
              </div>

              {/* Action hint */}
              <div className="flex-shrink-0">
                <div
                  className="px-3 py-1.5 rounded-lg text-[13px] font-semibold"
                  style={{ background: currentTabDef.bg, color: currentTabDef.color }}
                >
                  {tab === "won" && "Mark Payment →"}
                  {tab === "payment_received" && "Schedule Mob →"}
                  {tab === "mob_scheduled" && "View Details →"}
                  {tab === "job_active" && "Track Job →"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
