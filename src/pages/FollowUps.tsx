import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Tables } from "@/integrations/supabase/types";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { completeFollowUp } from "@/lib/followUpCadence";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CalendarClock, CheckCircle, Phone, Mail, MapPin, ExternalLink, Check, Building2 } from "lucide-react";

type FollowUp = Tables<"follow_ups">;

const OUTCOME_COLORS: Record<string, string> = {
  pending: "bg-slate-200 text-slate-700",
  reached: "bg-green-100 text-green-700",
  no_response: "bg-red-100 text-red-700",
  callback_requested: "bg-amber-100 text-amber-700",
  closed: "bg-slate-100 text-slate-600",
};

const OUTCOME_LABELS: Record<string, string> = {
  pending: "Pending",
  reached: "Reached",
  no_response: "No Response",
  callback_requested: "Callback Requested",
  closed: "Closed",
  cancelled: "Cancelled",
};

type Tab = "overdue" | "today" | "upcoming" | "completed";

export default function FollowUps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const today = new Date().toISOString().slice(0, 10);

  // Detail drawer state
  const [selected, setSelected] = useState<FollowUp | null>(null);
  const [outcome, setOutcome] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState("");

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["global-follow-ups"],
    queryFn: async () => {
      const data = await apiClient.get<FollowUp[]>("/follow-ups");
      if (!data.length) return { items: [], enquiryMap: new Map(), clientMap: new Map() };

      // One batched call: all enquiries with their client embedded.
      const enquiries = await apiClient.get<
        Array<Tables<"enquiries"> & { client?: { id: string; name: string } | null }>
      >("/enquiries", { embed: "client", include_deleted: true });
      const enquiryMap = new Map(enquiries.map((e) => [e.id, e]));
      const clientMap = new Map(
        enquiries.filter((e) => e.client).map((e) => [e.client!.id, e.client!]),
      );
      return { items: data, enquiryMap, clientMap };
    },
  });

  const items = followUps?.items ?? [];
  const enquiryMap = followUps?.enquiryMap ?? new Map();
  const clientMap = followUps?.clientMap ?? new Map();

  const selectedEnq = selected ? enquiryMap.get(selected.enquiry_id) : null;

  // Lazy-load the full client (phone/email) only when a follow-up is opened.
  const { data: selectedClient } = useQuery({
    queryKey: ["client-detail", selectedEnq?.client_id],
    queryFn: () => apiClient.get<Tables<"clients">>(`/clients/${selectedEnq!.client_id}`),
    enabled: !!selectedEnq?.client_id,
  });

  const resetForm = () => {
    setOutcome(""); setOutcomeNotes(""); setScheduleNext(false); setNextDate("");
  };
  const openDetail = (f: FollowUp) => { resetForm(); setSelected(f); };
  const closeDetail = () => { setSelected(null); resetForm(); };

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await completeFollowUp({
        followUp: selected,
        outcome,
        outcomeNotes,
        completedBy: user?.id ?? null,
        scheduleNext,
        nextDate,
      });
    },
    onSuccess: () => {
      toast.success("Follow-up completed!");
      queryClient.invalidateQueries({ queryKey: ["global-follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      closeDetail();
    },
    onError: (e: any) => toast.error(e.message),
  });

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

  const detailRow = (icon: ReactNode, label: string, value: ReactNode) => (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
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
                onClick={() => openDetail(f)}
              >
                <div
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: "36px", height: "36px", background: isOverdue ? "#FEF2F2" : "#FFF3E0" }}
                >
                  <CalendarClock className="h-4 w-4" style={{ color: isOverdue ? "#C62828" : "#E65100" }} />
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
                    <p className="text-[13px] truncate" style={{ color: "#546E7A" }}>{f.notes}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[13px] font-medium" style={{ color: isOverdue ? "#C62828" : "#546E7A" }}>
                    {formatDate(f.scheduled_date)}
                  </p>
                  {enq?.site_city && (
                    <p className="text-[12px]" style={{ color: "#94A3B8" }}>{enq.site_city}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail drawer — insights + complete, no navigation */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{selectedEnq?.ref_number ?? "—"}</span>
                  {selectedEnq?.status && (
                    <Badge variant="secondary" className="capitalize">{String(selectedEnq.status).replace(/_/g, " ")}</Badge>
                  )}
                </SheetTitle>
                <SheetDescription className="text-base font-semibold text-foreground">
                  {selectedClient?.name ?? selectedEnq?.client?.name ?? "Client"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-6">
                {/* Client contact */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</h3>
                  {selectedClient?.company && detailRow(<Building2 className="h-4 w-4" />, "Company", selectedClient.company)}
                  {selectedClient?.phone && detailRow(<Phone className="h-4 w-4" />, "Phone",
                    <a href={`tel:${selectedClient.phone}`} className="text-[#1B5EA0]">{selectedClient.phone}</a>)}
                  {selectedClient?.email && detailRow(<Mail className="h-4 w-4" />, "Email",
                    <a href={`mailto:${selectedClient.email}`} className="text-[#1B5EA0] break-all">{selectedClient.email}</a>)}
                </section>

                {/* Enquiry insights */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enquiry</h3>
                  {(selectedEnq?.site_address || selectedEnq?.site_city) &&
                    detailRow(<MapPin className="h-4 w-4" />, "Site", selectedEnq?.site_address || selectedEnq?.site_city)}
                  {selectedEnq?.structure_type && detailRow(<span className="text-xs">🏗️</span>, "Structure", selectedEnq.structure_type)}
                  {(selectedEnq?.num_bores != null || selectedEnq?.expected_depth_m != null) &&
                    detailRow(<span className="text-xs">📏</span>, "Scope",
                      `${selectedEnq?.num_bores ?? "—"} bores${selectedEnq?.expected_depth_m ? ` @ ${selectedEnq.expected_depth_m}m` : ""}`)}
                </section>

                {/* This follow-up */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up</h3>
                  {detailRow(<CalendarClock className="h-4 w-4" />, "Scheduled", formatDate(selected.scheduled_date))}
                  {selected.notes && detailRow(<span className="text-xs">📝</span>, "Notes", selected.notes)}
                  {selected.outcome !== "pending" && (
                    <div className="flex items-center gap-2">
                      <Badge className={OUTCOME_COLORS[selected.outcome] ?? ""}>{OUTCOME_LABELS[selected.outcome] ?? selected.outcome}</Badge>
                      {selected.outcome_notes && <span className="text-sm text-muted-foreground italic">→ {selected.outcome_notes}</span>}
                    </div>
                  )}
                </section>

                {/* Complete action (pending only) */}
                {selected.outcome === "pending" && (
                  <section className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-semibold text-foreground">Complete this follow-up</h3>
                    <div>
                      <Label>Outcome</Label>
                      <Select value={outcome} onValueChange={setOutcome}>
                        <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reached">Reached</SelectItem>
                          <SelectItem value="no_response">No Response</SelectItem>
                          <SelectItem value="callback_requested">Callback Requested</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} placeholder="What happened on this call?" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Schedule next follow-up?</Label>
                      <Switch checked={scheduleNext} onCheckedChange={setScheduleNext} />
                    </div>
                    {scheduleNext && (
                      <div>
                        <Label>Next date *</Label>
                        <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                      </div>
                    )}
                    <Button
                      className="w-full"
                      onClick={() => completeMutation.mutate()}
                      disabled={!outcome || (scheduleNext && !nextDate) || completeMutation.isPending}
                    >
                      <Check className="mr-1 h-4 w-4" /> Mark Complete
                    </Button>
                  </section>
                )}

                <Button variant="outline" className="w-full" onClick={() => navigate(`/enquiries/${selected.enquiry_id}`)}>
                  <ExternalLink className="mr-1 h-4 w-4" /> Open full enquiry
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
