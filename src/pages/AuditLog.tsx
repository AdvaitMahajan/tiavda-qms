import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { relativeTime } from "@/lib/utils";
import { History, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log — a plain-English feed of who did what, when. Every row is composed
// into a readable sentence; raw metadata JSON is NEVER shown to the user.
// ─────────────────────────────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  triggered_by: string | null;
  ref_number: string | null;
  enquiry_id: string | null;
  client_name: string | null;
  actor_name: string | null;
  actor_email: string | null;
};

type AuditResponse = {
  rows: AuditRow[];
  total: number;
  limit: number;
  offset: number;
  event_types: string[];
};

const PAGE_SIZE = 50;

/** snake_case / lowercase → "Title Case". */
function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Try to render a metadata date as "12 Jul 2026"; fall back to the raw value. */
function metaDate(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Who performed the action, in readable form (never a raw uuid). */
function actorLabel(r: AuditRow): string {
  if (r.actor_name) return r.actor_name;
  if (r.actor_email) return r.actor_email.split("@")[0];
  const sys = r.metadata?.triggered_by;
  if (typeof sys === "string") return `System (${humanize(sys)})`;
  return "System";
}

/**
 * Turn one event into a full plain-English sentence. Recognised metadata keys
 * are woven in; anything unrecognised is simply omitted (no JSON ever surfaces).
 */
function describeAction(r: AuditRow): string {
  const m = r.metadata ?? {};
  const from = humanize(r.from_status);
  const to = humanize(r.to_status);
  const reason = typeof m.reason === "string" ? m.reason : "";

  switch (r.event_type) {
    case "status_change": {
      if (m.trigger === "marked_won") return "Marked the deal as Won";
      if (m.trigger === "follow_up_completed") return `Advanced the enquiry to ${to || "the next stage"}`;
      if (reason === "payment_received_auto_transition") return "Advanced the enquiry to Payment Received";
      if (from && to && from !== to) return `Changed status from ${from} to ${to}`;
      if (to) return `Changed status to ${to}`;
      return "Changed the enquiry status";
    }
    case "assigned":
      return typeof m.description === "string" && m.description
        ? `Assigned the enquiry — ${m.description}`
        : "Reassigned the enquiry";
    case "quotation_sent":
      return "Sent the quotation to the client";
    case "quotation_approved":
      return "Approved a quotation variant";
    case "marked_lost":
      return reason ? `Marked the enquiry as Lost — reason: ${reason}` : "Marked the enquiry as Lost";
    case "reactivated":
      return "Reactivated the enquiry";
    case "follow_up_completed":
      return m.outcome ? `Completed a follow-up — outcome: ${humanize(String(m.outcome))}` : "Completed a follow-up";
    case "job_stage_completed":
      return m.stage ? `Completed a job stage — ${humanize(String(m.stage))}` : "Completed a job stage";
    case "payment_requested":
      return "Requested a payment from the client";
    case "payment_received_confirmed":
      return "Confirmed a payment was received";
    case "mobilisation_confirmed": {
      const when = metaDate(m.date);
      return when ? `Confirmed mobilisation for ${when}` : "Confirmed mobilisation";
    }
    case "mobilisation_rescheduled": {
      const when = metaDate(m.new_date);
      return when ? `Rescheduled mobilisation to ${when}` : "Rescheduled mobilisation";
    }
    case "mobilisation_unconfirmed":
      return "Mobilisation confirmation expired (no client response)";
    case "site_visit_scheduled": {
      const when = metaDate(m.visit_date);
      return when ? `Scheduled a site visit for ${when}` : "Scheduled a site visit";
    }
    case "site_visit_completed":
      return m.feasibility
        ? `Completed the site visit — feasibility: ${humanize(String(m.feasibility))}`
        : "Completed the site visit";
    default: {
      // Unknown type: humanise the event name and add a status transition if any.
      const base = humanize(r.event_type) || "Performed an action";
      if (from && to && from !== to) return `${base} (${from} → ${to})`;
      return base;
    }
  }
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [eventType, setEventType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit-log", page, eventType, q],
    queryFn: () =>
      apiClient.get<AuditResponse>("/audit", {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...(eventType ? { event_type: eventType } : {}),
        ...(q ? { q } : {}),
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const eventTypes = data?.event_types ?? [];
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < total;

  const applySearch = () => {
    setQ(searchInput.trim());
    setPage(0);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ background: "#EBF2FF", color: "#1565C0" }}
        >
          <History style={{ width: 20, height: 20 }} />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
            Audit Log
          </h1>
          <p className="text-[13px]" style={{ color: "#64748B" }}>
            Every recorded action — who did it, when, and what changed.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-5 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ width: 16, height: 16, color: "#94A3B8" }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder="Search by reference, client or person…"
            className="w-full rounded-lg border pl-9 pr-3 py-2 text-[13px] outline-none"
            style={{ borderColor: "#CBD5E1", color: "#0A1929" }}
          />
        </div>
        <select
          value={eventType}
          onChange={(e) => { setEventType(e.target.value); setPage(0); }}
          className="rounded-lg border px-3 py-2 text-[13px] outline-none bg-white"
          style={{ borderColor: "#CBD5E1", color: "#0A1929" }}
        >
          <option value="">All actions</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{humanize(t)}</option>
          ))}
        </select>
        <button
          onClick={applySearch}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-white"
          style={{ background: "#1565C0" }}
        >
          Search
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E2E8F0", background: "white" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", color: "#475569" }}>
                <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">When</th>
                <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Who</th>
                <th className="text-left font-semibold px-4 py-3">Action</th>
                <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Reference</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #EEF2F6" }}>
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-5 bg-muted/30 animate-pulse rounded" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState icon={History} title="No matching activity." subtitle="Actions across the app will appear here as they happen." />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #EEF2F6" }} className="hover:bg-slate-50">
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <div style={{ color: "#0A1929", fontWeight: 500 }}>{absoluteTime(r.created_at)}</div>
                      <div style={{ color: "#94A3B8", fontSize: 12 }}>{relativeTime(r.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap" style={{ color: "#0A1929" }}>
                      {actorLabel(r)}
                    </td>
                    <td className="px-4 py-3 align-top" style={{ color: "#334155", minWidth: 280 }}>
                      {describeAction(r)}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {r.ref_number && r.enquiry_id ? (
                        <Link to={`/enquiries/${r.enquiry_id}`} className="font-mono" style={{ color: "#1565C0" }}>
                          {r.ref_number}
                        </Link>
                      ) : (
                        <span style={{ color: "#94A3B8" }}>—</span>
                      )}
                      {r.client_name && (
                        <div style={{ color: "#94A3B8", fontSize: 12 }}>{r.client_name}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-[13px]" style={{ color: "#64748B" }}>
        <span>
          {total === 0 ? "No entries" : `Showing ${from}–${to} of ${total}`}
          {isFetching && !isLoading ? " · refreshing…" : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
            className="flex items-center gap-1 rounded-lg border px-3 py-1.5 disabled:opacity-40"
            style={{ borderColor: "#CBD5E1" }}
          >
            <ChevronLeft style={{ width: 15, height: 15 }} /> Prev
          </button>
          <button
            onClick={() => canNext && setPage((p) => p + 1)}
            disabled={!canNext}
            className="flex items-center gap-1 rounded-lg border px-3 py-1.5 disabled:opacity-40"
            style={{ borderColor: "#CBD5E1" }}
          >
            Next <ChevronRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
