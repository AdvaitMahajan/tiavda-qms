import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search, List, LayoutGrid, Download, Filter, FileQuestion,
} from "lucide-react";
import { EnquiryKanban } from "@/components/EnquiryKanban";
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
  if (!date) return <span className="text-muted-foreground">—</span>;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = d < today;
  const isToday = d.toDateString() === today.toDateString();

  return (
    <span className={isOverdue ? "text-red-600 font-medium" : isToday ? "text-amber-600 font-medium" : "text-muted-foreground"}>
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

  // Realtime subscription
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Enquiries</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ref, client, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>

          <StatusFilterPopover selected={statusFilter} onChange={setStatusFilter} />

          {view === "list" && (
            <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          )}

          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="icon"
              className="rounded-none h-9 w-9"
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "board" ? "default" : "ghost"}
              size="icon"
              className="rounded-none h-9 w-9"
              onClick={() => setView("board")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
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
        <Button variant="outline" size="sm" className="relative">
          <Filter className="h-4 w-4 mr-1" /> Status
          {selected.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {selected.length}
            </span>
          )}
        </Button>
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
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileQuestion className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <p className="text-lg font-medium text-foreground">No enquiries found.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Generate an intake link from the Clients page to create your first enquiry.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref#</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Quote</TableHead>
            <TableHead>Follow-up</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onRowClick(r.id)}>
              <TableCell className="font-mono text-[--navy] font-medium">{r.ref_number}</TableCell>
              <TableCell className="font-semibold">{r.client_name}</TableCell>
              <TableCell>{r.site_city}</TableCell>
              <TableCell>
                <Badge className={`${STATUS_COLORS[r.status]} text-white border-0`}>
                  {STATUS_LABELS[r.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {r.quote_amount ? (
                  <span className="font-medium">{formatCurrency(Number(r.quote_amount))}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <FollowUpCell date={r.next_follow_up} />
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{relativeTime(r.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { STATUS_COLORS, STATUS_LABELS, ALL_STATUSES, type LeadStatus };
