import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { formatCurrency, relativeTime, clientDisplayName, downloadBlob } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search, List, LayoutGrid, Download, Filter, FileQuestion, Plus,
} from "lucide-react";
import { EnquiryKanban, VALID_TRANSITIONS } from "@/components/EnquiryKanban";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonRow } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Tables } from "@/integrations/supabase/types";

type LeadStatus = Tables<"enquiries">["status"];

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-slate-500",
  intake_pending: "bg-sky-500",
  pending: "bg-blue-600",
  sent: "bg-indigo-600",
  follow_up: "bg-amber-600",
  negotiation: "bg-orange-600",
  approved: "bg-purple-600",
  payment_received: "bg-violet-600",
  mobilization_scheduled: "bg-cyan-700",
  job_active: "bg-emerald-600",
  confirmed: "bg-green-700",
  lost: "bg-red-600",
  inactive: "bg-gray-500",
  completed: "bg-teal-600",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  intake_pending: "Intake Pending",
  pending: "Quotation Prep",
  sent: "Quote Sent",
  follow_up: "Follow Up",
  negotiation: "Negotiation",
  approved: "Won",
  payment_received: "Payment Received",
  mobilization_scheduled: "Mob Scheduled",
  job_active: "Job Active",
  confirmed: "Confirmed",
  lost: "Lost",
  inactive: "Inactive",
  completed: "Completed",
};

export const PIPELINE_STATUSES: LeadStatus[] = [
  "new", "intake_pending", "pending", "sent", "follow_up", "negotiation",
  "approved", "payment_received", "mobilization_scheduled", "job_active",
];

export const CLOSED_STATUSES: LeadStatus[] = ["lost", "inactive", "completed"];

const ALL_STATUSES: LeadStatus[] = [...PIPELINE_STATUSES, ...CLOSED_STATUSES];

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
  num_bores: number | null;
  structure_type: string | null;
  expected_depth_m: number | null;
  soil_type_hint: string | null;
  service_type: string;
}

type EnquiryListItem = Tables<"enquiries"> & {
  client?: { id: string; name: string; phone: string } | null;
  quote_total?: number | null;
};

function useEnquiries() {
  return useQuery({
    queryKey: ["enquiries-list"],
    queryFn: async (): Promise<EnquiryRow[]> => {
      const enquiries = await apiClient.get<EnquiryListItem[]>("/enquiries", { embed: "client,quote" });
      return enquiries.map((e) => ({
        ...e,
        client_name: clientDisplayName(e.client),
        phone: e.client?.phone ?? "",
        quote_amount: e.quote_total ?? null,
      })) as unknown as EnquiryRow[];
    },
    refetchInterval: 20_000, // replaces the realtime subscription
    refetchOnWindowFocus: true,
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
  downloadBlob(blob, `enquiries-${new Date().toISOString().slice(0, 10)}.csv`);
}

export default function Enquiries() {
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>([]);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const { data: rows, isLoading } = useEnquiries();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Deep-link support: /enquiries?status=lost or ?status=sent,follow_up,negotiation
  // (used by the dashboard metric tiles so tapping a number lands on exactly that data).
  const statusParam = searchParams.get("status") ?? "";
  useEffect(() => {
    const wanted = statusParam.split(",").map((s) => s.trim()).filter(Boolean) as LeadStatus[];
    setStatusFilter(wanted);
    // Closed states are hidden on the board by default — reveal them when linked to.
    if (wanted.some((s) => s === "lost" || s === "inactive" || s === "completed")) setShowClosed(true);
  }, [statusParam]);

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

  const totalCount = rows?.length ?? 0;
  const pipelineCounts = useMemo(() => {
    const counts = { active: 0, follow_up: 0, won: 0 };
    for (const r of rows ?? []) {
      if (r.status === "pending" || r.status === "sent") counts.active++;
      else if (r.status === "follow_up") counts.follow_up++;
      else if (r.status === "approved") counts.won++;
    }
    return counts;
  }, [rows]);

  return (
    <div style={{ background: "#F0F4F8" }}>
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
          position: "sticky",
          top: 0,
          zIndex: 20,
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
              { emoji: "🟢", label: "Won", count: pipelineCounts.won },
            ].map((p) => (
              <span
                key={p.label}
                className="text-[13px] font-medium px-3 py-1 rounded-full"
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

          {/* Add Lead */}
          <button
            onClick={() => setShowAddLead(true)}
            style={{
              background: "linear-gradient(135deg, #FF8F00, #FFB300)",
              border: "none",
              borderRadius: "10px",
              padding: "8px 16px",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(255,143,0,0.3)",
            }}
          >
            <Plus className="h-4 w-4" /> Add Lead
          </button>

          {/* Show Closed toggle (board view only) */}
          {view === "board" && (
            <button
              onClick={() => setShowClosed((p) => !p)}
              style={{
                background: showClosed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "10px",
                padding: "8px 14px",
                color: "rgba(255,255,255,0.85)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                transition: "background 150ms",
              }}
            >
              {showClosed ? "Hide Closed" : "Show Closed"}
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
        <EnquiryKanban rows={filtered} isLoading={isLoading} statusFilter={statusFilter} search={search} showClosed={showClosed} />
      )}

      <AddLeadDialog open={showAddLead} onOpenChange={setShowAddLead} />
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
              className="absolute -top-1.5 -right-1.5 text-white text-[12px] rounded-full w-4 h-4 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#FF8F00,#FFB300)" }}
            >
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        {ALL_STATUSES.filter((s) => s !== "confirmed").map((s) => (
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
  const queryClient = useQueryClient();

  const handleStatusChange = async (row: EnquiryRow, toStatus: LeadStatus) => {
    try {
      const updates: Record<string, unknown> = { status: toStatus };
      if (toStatus === "lost") {
        updates.lost_date = new Date().toISOString().slice(0, 10);
      }
      if (toStatus === "inactive") {
        updates.lost_date = new Date().toISOString().slice(0, 10);
        updates.lost_reason = "No response after follow-up cycle";
      }
      if (toStatus === "follow_up" && (row.status === "lost" || row.status === "inactive")) {
        updates.lost_date = null;
        updates.lost_reason = null;
      }

      await apiClient.patch(`/enquiries/${row.id}`, updates);
      await apiClient.post(`/enquiries/${row.id}/events`, {
        event_type: "status_change",
        from_status: row.status,
        to_status: toStatus,
      });

      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      toast.success(`${row.ref_number} → ${STATUS_LABELS[toStatus]}`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to update status");
    }
  };
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
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow style={{ background: "#F8FAFC" }}>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Ref#</TableHead>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Type</TableHead>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Client</TableHead>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>City</TableHead>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Status</TableHead>
            <TableHead className="text-right" style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Quote</TableHead>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Follow-up</TableHead>
            <TableHead style={{ fontSize: "12px", color: "#546E7A", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Created</TableHead>
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
              <TableCell>
                <span
                  className="text-[12px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: r.service_type === "consultancy" ? "#EDE7F6" : "#E3F2FD",
                    color: r.service_type === "consultancy" ? "#6A1B9A" : "#1565C0",
                  }}
                >
                  {r.service_type === "consultancy" ? "CONSULT" : "SI"}
                </span>
              </TableCell>
              <TableCell className="font-semibold" style={{ color: "#0A1929" }}>{r.client_name}</TableCell>
              <TableCell style={{ color: "#546E7A" }}>{r.site_city}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:ring-2 hover:ring-blue-200 rounded-full transition-all">
                      <StatusBadge status={r.status} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1.5" align="start">
                    <p className="text-[12px] font-semibold uppercase px-2 py-1" style={{ color: "#546E7A" }}>Move to</p>
                    {(VALID_TRANSITIONS[r.status] ?? []).length === 0 ? (
                      <p className="text-[13px] px-2 py-1.5" style={{ color: "#94A3B8" }}>No transitions available</p>
                    ) : (
                      (VALID_TRANSITIONS[r.status] ?? []).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(r, s)}
                          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-[13px] hover:bg-slate-100 transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]}`} />
                          {STATUS_LABELS[s]}
                        </button>
                      ))
                    )}
                  </PopoverContent>
                </Popover>
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
    </div>
  );
}

export { STATUS_COLORS, STATUS_LABELS, ALL_STATUSES, type LeadStatus };
