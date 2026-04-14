import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search, List, LayoutGrid, Download, Filter, FileQuestion,
} from "lucide-react";
import { EnquiryKanban } from "@/components/EnquiryKanban";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonRow } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Tables } from "@/integrations/supabase/types";

type LeadStatus = Tables<"enquiries">["status"];

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-slate-500",
  pending: "bg-blue-600",
  sent: "bg-indigo-600",
  follow_up: "bg-amber-600",
  approved: "bg-purple-600",
  confirmed: "bg-green-700",
  lost: "bg-red-600",
  completed: "bg-teal-600",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  pending: "Pending",
  sent: "Sent",
  follow_up: "Follow Up",
  approved: "Approved",
  confirmed: "Confirmed",
  lost: "Lost",
  completed: "Completed",
};

const ALL_STATUSES: LeadStatus[] = [
  "new", "pending", "sent", "follow_up", "approved", "confirmed", "lost", "completed",
];

export interface EnquiryRow {
  id: string;
  ref_number: string;
  client_name: string;
  phone: string;
  site_city: string;
  status: LeadStatus;
  quote_amount: number | null;
  next_follow_up: string | null;
  created_at: string;
  enquiry_date: string;
  client_id: string;
  num_bores: number;
  structure_type: string;
  expected_depth_m: number | null;
  soil_type_hint: string | null;
}

function useEnquiries() {
  return useQuery({
    queryKey: ["enquiries-list"],
    queryFn: async (): Promise<EnquiryRow[]> => {
      const { data: enquiries, error: eErr } = await supabase
        .from("enquiries")
        .select("id, ref_number, client_id, site_city, status, next_follow_up, created_at, enquiry_date, num_bores, structure_type, expected_depth_m, soil_type_hint")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (eErr) throw eErr;
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
        .eq("status", "approved")
        .in("enquiry_id", enquiries.map((e) => e.id));

      const quoteMap = new Map(quotes?.map((q) => [q.enquiry_id, q.total_amount]) ?? []);

      return enquiries.map((e) => {
        const client = clientMap.get(e.client_id);
        return {
          ...e,
          client_name: client?.name ?? "Unknown",
          phone: client?.phone ?? "",
          quote_amount: quoteMap.get(e.id) ?? null,
        } as EnquiryRow;
      });
    },
  });
}

function FollowUpCell({ date }: { date: string | null }) {
  if (!date) return <span style={{ color: "#546E7A" }}>—</span>;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = d < today;
  const isToday = d.toDateString() === today.toDateString();

  return (
    <span style={{ color: isOverdue ? "#C62828" : isToday ? "#E65100" : "#546E7A", fontWeight: isOverdue || isToday ? 500 : 400 }}>
      {isOverdue && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1.5 align-middle" />}
      {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
    </span>
  );
}

function exportCSV(rows: EnquiryRow[]) {
  const headers = ["Ref#", "Client", "Phone", "City", "Status", "Quote Amount", "Enquiry Date", "Next Follow-up"];
  const csvRows = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.ref_number,
        `"${r.client_name}"`,
        r.phone,
        r.site_city,
        r.status,
        r.quote_amount ?? "",
        r.enquiry_date,
        r.next_follow_up ?? "",
      ].join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Enquiries() {
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>([]);
  const { data: rows, isLoading } = useEnquiries();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!rows) return [];
    let result = rows;
    if (statusFilter.length > 0) {
      result = result.filter((r) => statusFilter.includes(r.status));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.ref_number.toLowerCase().includes(q) ||
          r.client_name.toLowerCase().includes(q) ||
          r.site_city.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, search, statusFilter]);

  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("enquiries-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "enquiries" }, () => {
        queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const totalCount = rows?.length ?? 0;
  const pipelineCounts = useMemo(() => {
    const counts = { active: 0, follow_up: 0, confirmed: 0 };
    for (const r of rows ?? []) {
      if (r.status === "pending" || r.status === "sent") counts.active++;
      else if (r.status === "follow_up") counts.follow_up++;
      else if (r.status === "confirmed") counts.confirmed++;
    }
    return counts;
  }, [rows]);

  return (
    <div className="min-h-screen p-6" style={{ background: "#F0F4F8" }}>
      {/* Gradient header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
          borderRadius: "20px",
          padding: "28px 32px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(10,25,41,0.25)",
          position: "relative",
          overflow: "hidden",
          flexWrap: "wrap",
          gap: "16px",
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
            Enquiries
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
            {isLoading ? "Loading…" : `${totalCount} total enquiries`}
          </p>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
            {[
              { emoji: "🔵", label: "Active", count: pipelineCounts.active },
              { emoji: "🟡", label: "Follow-up", count: pipelineCounts.follow_up },
              { emoji: "🟢", label: "Confirmed", count: pipelineCounts.confirmed },
            ].map((p) => (
              <span
                key={p.label}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                {p.emoji} {p.count} {p.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap" style={{ position: "relative", zIndex: 1 }}>
          {/* Glass search */}
          <div style={{ position: "relative" }}>
            <Search
              style={{
                position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                width: "16px", height: "16px", color: "rgba(255,255,255,0.4)",
              }}
            />
            <input
              className="glass-input"
              placeholder="Search ref, client, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "10px",
                padding: "8px 14px 8px 36px",
                color: "white",
                fontSize: "13px",
                width: "220px",
                outline: "none",
              }}
            />
          </div>

          <StatusFilterPopover selected={statusFilter} onChange={setStatusFilter} />

          {view === "list" && (
            <button
              onClick={() => exportCSV(filtered)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "10px",
                padding: "8px 14px",
                color: "rgba(255,255,255,0.85)",
                fontSize: "13px",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
              }}
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          )}

          {/* View toggle */}
          <div
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "10px",
              padding: "4px",
              display: "flex",
              gap: "2px",
            }}
          >
            <button
              onClick={() => setView("list")}
              style={{
                background: view === "list" ? "rgba(255,255,255,0.2)" : "transparent",
                color: view === "list" ? "white" : "rgba(255,255,255,0.5)",
                border: "none",
                padding: "6px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("board")}
              style={{
                background: view === "board" ? "rgba(255,255,255,0.2)" : "transparent",
                color: view === "board" ? "white" : "rgba(255,255,255,0.5)",
                border: "none",
                padding: "6px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
      {view === "list" ? (
        <EnquiryListView rows={filtered} isLoading={isLoading} onRowClick={(id) => navigate(`/enquiries/${id}`)} />
      ) : (
        <EnquiryKanban rows={filtered} isLoading={isLoading} statusFilter={statusFilter} search={search} />
      )}
    </div>
  );
}

function StatusFilterPopover({ selected, onChange }: { selected: LeadStatus[]; onChange: (v: LeadStatus[]) => void }) {
  const toggle = (s: LeadStatus) => {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "10px",
            padding: "8px 14px",
            color: "rgba(255,255,255,0.85)",
            fontSize: "13px",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <Filter className="h-4 w-4" /> Status
          {selected.length > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#FF8F00,#FFB300)" }}
            >
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        {ALL_STATUSES.map((s) => (
          <label key={s} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm">
            <Checkbox checked={selected.includes(s)} onCheckedChange={() => toggle(s)} />
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]}`} />
            {STATUS_LABELS[s]}
          </label>
        ))}
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => onChange([])}>
            Clear all
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EnquiryListView({ rows, isLoading, onRowClick }: { rows: EnquiryRow[]; isLoading: boolean; onRowClick: (id: string) => void }) {
  if (isLoading) {
    return (
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          border: "1px solid #E0E7EF",
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No enquiries found"
        subtitle="Generate an intake link from the Clients page to create your first enquiry."
      />
    );
  }

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid #E0E7EF",
        overflow: "hidden",
      }}
    >
      <Table>
        <TableHeader>
          <TableRow style={{ background: "#F8FAFC" }}>
            <TableHead style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Ref#</TableHead>
            <TableHead style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Client</TableHead>
            <TableHead style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>City</TableHead>
            <TableHead style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Status</TableHead>
            <TableHead className="text-right" style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Quote</TableHead>
            <TableHead style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Follow-up</TableHead>
            <TableHead style={{ fontSize: "10px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              className="cursor-pointer transition-colors duration-100"
              style={{ borderBottom: "1px solid #F0F4F8" }}
              onClick={() => onRowClick(r.id)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <TableCell className="font-mono font-medium" style={{ color: "#0A1929" }}>{r.ref_number}</TableCell>
              <TableCell className="font-semibold" style={{ color: "#0A1929" }}>{r.client_name}</TableCell>
              <TableCell style={{ color: "#546E7A" }}>{r.site_city}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-right">
                {r.quote_amount ? (
                  <span className="font-medium" style={{ color: "#0A1929" }}>{formatCurrency(Number(r.quote_amount))}</span>
                ) : (
                  <span style={{ color: "#546E7A" }}>—</span>
                )}
              </TableCell>
              <TableCell>
                <FollowUpCell date={r.next_follow_up} />
              </TableCell>
              <TableCell className="text-sm" style={{ color: "#546E7A" }}>{relativeTime(r.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { STATUS_COLORS, STATUS_LABELS, ALL_STATUSES, type LeadStatus };
