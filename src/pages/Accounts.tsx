import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Wallet, TrendingUp, AlertTriangle, Clock, CheckCircle2, IndianRupee, Search, Download,
} from "lucide-react";

type Row = {
  id: string;
  payment_type: string;
  amount_requested: number;
  amount_received: number | null;
  status: string;
  payment_method: string | null;
  transaction_ref: string | null;
  due_date: string | null;
  request_sent_at: string | null;
  received_at: string | null;
  created_at: string;
  enquiries: { ref_number: string; site_city: string; clients: { name: string; company: string | null } | null } | null;
};

const PERIODS = [
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "fy", label: "This Financial Year" },
  { key: "custom", label: "Custom Month" },
  { key: "all", label: "All Time" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  received: { bg: "#DCFCE7", color: "#15673A", label: "Received" },
  partial: { bg: "#FEF3C7", color: "#92400E", label: "Partial" },
  request_sent: { bg: "#EBF2FF", color: "#1565C0", label: "Requested" },
  pending_request: { bg: "#F1F5F9", color: "#546E7A", label: "Pending" },
  refunded: { bg: "#FEF2F2", color: "#B91C1C", label: "Refunded" },
};

const inr = (n: number) => formatCurrency(Math.round(n));
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function fyRange(now: Date) {
  // Indian FY: 1 Apr – 31 Mar
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(y, 3, 1), end: new Date(y + 1, 2, 31, 23, 59, 59), label: `FY ${y}–${String(y + 1).slice(2)}` };
}

export default function Accounts() {
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [customMonth, setCustomMonth] = useState(monthKey(new Date()));
  const [statusFilter, setStatusFilter] = useState<"all" | "received" | "outstanding" | "refunded">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "advance" | "final">("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["accounts-payments"],
    queryFn: async () => {
      const data = await apiClient.get<any[]>("/accounts/payments");
      return data.filter((r) => !r.enquiries?.deleted_at) as Row[];
    },
  });

  const now = new Date();
  const { start, end } = useMemo(() => {
    if (period === "this_month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    if (period === "last_month") return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    if (period === "fy") { const r = fyRange(now); return { start: r.start, end: r.end }; }
    if (period === "custom") { const [y, m] = customMonth.split("-").map(Number); return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) }; }
    return { start: new Date(2000, 0, 1), end: new Date(2999, 0, 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customMonth]);

  const inPeriod = (iso: string | null) => { if (!iso) return false; const d = new Date(iso); return d >= start && d <= end; };
  const balance = (r: Row) => Number(r.amount_requested) - Number(r.amount_received ?? 0);

  // ── Period summary (revenue is recognised when received) ──
  const summary = useMemo(() => {
    const receivedInPeriod = rows.filter((r) => (r.status === "received" || r.status === "partial") && inPeriod(r.received_at));
    const sum = (arr: Row[]) => arr.reduce((s, r) => s + Number(r.amount_received ?? 0), 0);
    const advance = receivedInPeriod.filter((r) => r.payment_type === "advance");
    const final = receivedInPeriod.filter((r) => r.payment_type !== "advance");

    // Outstanding is a live snapshot (not period-bound).
    const outstanding = rows.filter((r) => ["pending_request", "request_sent", "partial"].includes(r.status));
    const outstandingTotal = outstanding.reduce((s, r) => s + balance(r), 0);
    const overdue = outstanding.filter((r) => r.due_date && new Date(r.due_date) < now && balance(r) > 0);
    const overdueTotal = overdue.reduce((s, r) => s + balance(r), 0);

    return {
      revenue: sum(receivedInPeriod), advanceRev: sum(advance), finalRev: sum(final),
      paidCount: receivedInPeriod.length,
      outstandingTotal, outstandingCount: outstanding.length,
      overdueTotal, overdueCount: overdue.length,
    };
  }, [rows, start, end]);

  // ── FY monthly revenue trend ──
  const trend = useMemo(() => {
    const r = fyRange(now);
    const months: { label: string; key: string; revenue: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(r.start.getFullYear(), r.start.getMonth() + i, 1);
      months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), key: monthKey(d), revenue: 0 });
    }
    for (const row of rows) {
      if ((row.status === "received" || row.status === "partial") && row.received_at) {
        const k = monthKey(new Date(row.received_at));
        const m = months.find((x) => x.key === k);
        if (m) m.revenue += Number(row.amount_received ?? 0);
      }
    }
    return { months, max: Math.max(1, ...months.map((m) => m.revenue)), label: r.label };
  }, [rows]);

  // ── Ledger (table) ──
  const ledger = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "all" && (typeFilter === "advance" ? r.payment_type !== "advance" : r.payment_type === "advance")) return false;
      if (statusFilter === "received" && !(r.status === "received" || r.status === "partial")) return false;
      if (statusFilter === "outstanding" && !["pending_request", "request_sent", "partial"].includes(r.status)) return false;
      if (statusFilter === "refunded" && r.status !== "refunded") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hit = `${r.enquiries?.clients?.name ?? ""} ${r.enquiries?.clients?.company ?? ""} ${r.enquiries?.ref_number ?? ""}`.toLowerCase();
        if (!hit.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, typeFilter, search]);

  const collectionRate = summary.revenue + summary.outstandingTotal > 0
    ? Math.round((summary.revenue / (summary.revenue + summary.outstandingTotal)) * 100) : 0;

  const exportCsv = () => {
    const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ["Client", "Company", "Enquiry", "City", "Type", "Requested", "Received", "Balance", "Status", "Method", "Txn Ref", "Due Date", "Requested On", "Received On"];
    const lines = ledger.map((r) => [
      r.enquiries?.clients?.name ?? "", r.enquiries?.clients?.company ?? "",
      r.enquiries?.ref_number ?? "", r.enquiries?.site_city ?? "",
      r.payment_type, Number(r.amount_requested), Number(r.amount_received ?? 0), balance(r),
      r.status, r.payment_method ?? "", r.transaction_ref ?? "",
      r.due_date ? formatDate(r.due_date) : "", r.request_sent_at ? formatDate(r.request_sent_at) : "",
      r.received_at ? formatDate(r.received_at) : "",
    ].map(cell).join(","));
    const csv = [headers.join(","), ...lines].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-ledger-${monthKey(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6" style={{ background: "#F0F4F8", minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4" style={{ background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)", borderRadius: "20px", padding: "24px", marginBottom: "20px", boxShadow: "0 8px 32px rgba(10,25,41,0.25)" }}>
        <div>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "26px", color: "white", margin: 0 }}>Accounts &amp; Payments</h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.65)", marginTop: "4px", marginBottom: 0 }}>
            Revenue, collections and outstanding — advance &amp; final payments
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)",
                background: period === p.key ? "white" : "rgba(255,255,255,0.12)", color: period === p.key ? "#0A1929" : "white" }}>
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <input type="month" value={customMonth} onChange={(e) => setCustomMonth(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "10px", border: "none", fontSize: "13px" }} />
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={TrendingUp} iconBg="#DCFCE7" iconColor="#15673A" label="Revenue Received" value={inr(summary.revenue)}
          sub={`${summary.paidCount} payment${summary.paidCount === 1 ? "" : "s"} · ${period === "all" ? "all time" : "selected period"}`} />
        <StatCard icon={IndianRupee} iconBg="#EBF2FF" iconColor="#1565C0" label="Advance / Final"
          value={`${inr(summary.advanceRev)}`} sub={`Final: ${inr(summary.finalRev)}`} />
        <StatCard icon={Clock} iconBg="#FEF3C7" iconColor="#92400E" label="Outstanding (live)" value={inr(summary.outstandingTotal)}
          sub={`${summary.outstandingCount} unpaid · ${collectionRate}% collected`} />
        <StatCard icon={AlertTriangle} iconBg="#FEF2F2" iconColor="#B91C1C" label="Overdue" value={inr(summary.overdueTotal)}
          sub={`${summary.overdueCount} past due date`} />
      </div>

      {/* FY revenue trend */}
      <div style={card} className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "16px", color: "#0A1929" }}>Monthly Revenue — {trend.label}</span>
          <span style={{ fontSize: "13px", color: "#546E7A" }}>Total: {inr(trend.months.reduce((s, m) => s + m.revenue, 0))}</span>
        </div>
        <div className="flex items-end gap-2" style={{ height: "160px" }}>
          {trend.months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5" style={{ height: "100%" }} title={inr(m.revenue)}>
              <span style={{ fontSize: "10px", color: "#546E7A", fontWeight: 600 }}>{m.revenue > 0 ? `${Math.round(m.revenue / 1000)}k` : ""}</span>
              <div style={{ width: "100%", maxWidth: "34px", height: `${(m.revenue / trend.max) * 100}%`, minHeight: m.revenue > 0 ? "4px" : "0",
                background: "linear-gradient(180deg,#2979FF,#1565C0)", borderRadius: "6px 6px 0 0" }} />
              <span style={{ fontSize: "11px", color: "#546E7A" }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger */}
      <div style={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "16px", color: "#0A1929" }}>Payment Ledger</span>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              {(["all", "received", "outstanding", "refunded"] as const).map((s) => (
                <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} label={s === "outstanding" ? "Not Paid" : s[0].toUpperCase() + s.slice(1)} />
              ))}
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "advance" | "final")}
              aria-label="Payment type"
              style={{ padding: "7px 28px 7px 11px", borderRadius: "8px", border: "1px solid #E0E7EF", fontSize: "12px", fontWeight: 600,
                background: "#FAFBFC", color: "#546E7A", cursor: "pointer" }}
            >
              <option value="all">All types</option>
              <option value="advance">Advance</option>
              <option value="final">Final</option>
            </select>
            <div className="relative">
              <Search style={{ width: 14, height: 14, color: "#94A3B8", position: "absolute", left: 10, top: 10 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client or ref…"
                style={{ padding: "7px 10px 7px 30px", borderRadius: "8px", border: "1px solid #E0E7EF", fontSize: "13px", background: "#FAFBFC" }} />
            </div>
            <button onClick={exportCsv} disabled={ledger.length === 0}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                cursor: ledger.length === 0 ? "default" : "pointer", opacity: ledger.length === 0 ? 0.5 : 1,
                background: "linear-gradient(135deg,#15673A,#22C55E)", color: "white", border: "none" }}>
              <Download style={{ width: 14, height: 14 }} /> Export CSV
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "#EEF2F7" }} />)}</div>
        ) : ledger.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#94A3B8", fontSize: "14px" }}>No payments match these filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#546E7A", borderBottom: "1px solid #E0E7EF" }}>
                  {["Client", "Enquiry", "Type", "Requested", "Received", "Status", "Method", "Due", "Received On"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => {
                  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending_request;
                  const overdue = r.due_date && new Date(r.due_date) < now && balance(r) > 0;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #F0F4F8" }}>
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: 600, color: "#0A1929" }}>{r.enquiries?.clients?.name ?? "—"}</div>
                        {r.enquiries?.clients?.company && <div style={{ fontSize: "11px", color: "#94A3B8" }}>{r.enquiries.clients.company}</div>}
                      </td>
                      <td style={{ padding: "10px", fontFamily: "JetBrains Mono, monospace", color: "#546E7A", whiteSpace: "nowrap" }}>{r.enquiries?.ref_number ?? "—"}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", textTransform: "capitalize",
                          background: r.payment_type === "advance" ? "#EBF2FF" : "#F3E8FF", color: r.payment_type === "advance" ? "#1565C0" : "#6A1B9A" }}>{r.payment_type}</span>
                      </td>
                      <td style={{ padding: "10px", whiteSpace: "nowrap" }}>{inr(Number(r.amount_requested))}</td>
                      <td style={{ padding: "10px", whiteSpace: "nowrap", color: Number(r.amount_received) > 0 ? "#15673A" : "#94A3B8", fontWeight: Number(r.amount_received) > 0 ? 600 : 400 }}>
                        {Number(r.amount_received) > 0 ? inr(Number(r.amount_received)) : "—"}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: st.bg, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>
                      </td>
                      <td style={{ padding: "10px", color: "#546E7A", whiteSpace: "nowrap" }}>{r.payment_method ?? "—"}</td>
                      <td style={{ padding: "10px", whiteSpace: "nowrap", color: overdue ? "#B91C1C" : "#546E7A", fontWeight: overdue ? 700 : 400 }}>
                        {r.due_date ? formatDate(r.due_date) : "—"}{overdue ? " ⚠" : ""}
                      </td>
                      <td style={{ padding: "10px", color: "#546E7A", whiteSpace: "nowrap" }}>{r.received_at ? formatDate(r.received_at) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "white", borderRadius: "16px", padding: "20px 24px", border: "1px solid #E0E7EF", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }: { icon: React.ElementType; iconBg: string; iconColor: string; label: string; value: string; sub: string }) {
  return (
    <div style={card}>
      <div className="flex items-center gap-3 mb-2">
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon style={{ width: 18, height: 18, color: iconColor }} />
        </div>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#546E7A" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: "24px", color: "#0A1929" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "2px" }}>{sub}</div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      style={{ padding: "6px 11px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
        background: active ? "#EBF2FF" : "#F0F4F8", color: active ? "#1565C0" : "#546E7A", border: active ? "1px solid #BFDBFE" : "1px solid #E0E7EF" }}>
      {label}
    </button>
  );
}
