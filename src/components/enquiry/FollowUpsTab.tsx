import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { CalendarClock, Plus, Check } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type FollowUp = Tables<"follow_ups">;
type FollowUpOutcome = FollowUp["outcome"];

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
};

export function FollowUpsTab({ enquiryId }: { enquiryId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addNotes, setAddNotes] = useState("");

  const [completeTarget, setCompleteTarget] = useState<FollowUp | null>(null);
  const [outcome, setOutcome] = useState<string>("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState("");

  const { data: followUps = [], isLoading } = useQuery({
    queryKey: ["follow-ups", enquiryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("*")
        .eq("enquiry_id", enquiryId)
        .order("scheduled_date", { ascending: false });
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("follow_ups").insert({
        enquiry_id: enquiryId,
        scheduled_date: addDate,
        scheduled_time: addTime || null,
        notes: addNotes || null,
        outcome: "pending",
        auto_scheduled: false,
      });
      if (error) throw error;

      // Update enquiry next_follow_up if this date is earlier
      const { data: enq } = await supabase.from("enquiries").select("next_follow_up").eq("id", enquiryId).single();
      if (!enq?.next_follow_up || addDate < enq.next_follow_up) {
        await supabase.from("enquiries").update({ next_follow_up: addDate }).eq("id", enquiryId);
      }
    },
    onSuccess: () => {
      toast.success("Follow-up scheduled!");
      queryClient.invalidateQueries({ queryKey: ["follow-ups", enquiryId] });
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      setShowAdd(false);
      setAddDate(""); setAddTime(""); setAddNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!completeTarget) return;

      await supabase.from("follow_ups").update({
        outcome: outcome as FollowUpOutcome,
        outcome_notes: outcomeNotes || null,
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
      }).eq("id", completeTarget.id);

      let newNextDate: string | null = null;

      if (scheduleNext && nextDate) {
        await supabase.from("follow_ups").insert({
          enquiry_id: enquiryId,
          scheduled_date: nextDate,
          auto_scheduled: false,
          outcome: "pending",
        });
        newNextDate = nextDate;
      }

      // Update enquiry next_follow_up
      if (outcome === "closed" && !scheduleNext) {
        await supabase.from("enquiries").update({ next_follow_up: null }).eq("id", enquiryId);
      } else if (newNextDate) {
        await supabase.from("enquiries").update({ next_follow_up: newNextDate }).eq("id", enquiryId);
      } else {
        // Find next pending follow-up
        const { data: nextPending } = await supabase
          .from("follow_ups")
          .select("scheduled_date")
          .eq("enquiry_id", enquiryId)
          .eq("outcome", "pending")
          .neq("id", completeTarget.id)
          .order("scheduled_date")
          .limit(1)
          .maybeSingle();
        await supabase.from("enquiries").update({
          next_follow_up: nextPending?.scheduled_date ?? null,
        }).eq("id", enquiryId);
      }

      await supabase.from("enquiry_events").insert({
        enquiry_id: enquiryId,
        event_type: "follow_up_completed",
        triggered_by: user?.id ?? null,
        metadata: { outcome, follow_up_id: completeTarget.id } as any,
      });
    },
    onSuccess: () => {
      toast.success("Follow-up completed!");
      queryClient.invalidateQueries({ queryKey: ["follow-ups", enquiryId] });
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      setCompleteTarget(null);
      setOutcome(""); setOutcomeNotes(""); setScheduleNext(false); setNextDate("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);

  if (isLoading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/30 animate-pulse rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-foreground">Follow-ups</h2>
        <Button onClick={() => setShowAdd(true)} variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add Follow-up
        </Button>
      </div>

      {followUps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-3">No follow-ups scheduled.</p>
            <Button onClick={() => setShowAdd(true)} variant="outline">Add Follow-up</Button>
          </CardContent>
        </Card>
      ) : (
        followUps.map((fu) => {
          const isOverdue = fu.outcome === "pending" && fu.scheduled_date < today;
          return (
            <Card
              key={fu.id}
              className={cn(
                isOverdue && "border-l-4 border-l-red-500 bg-red-50/50"
              )}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {formatDate(fu.scheduled_date)}
                      {fu.scheduled_time && <span className="text-muted-foreground ml-1">{fu.scheduled_time}</span>}
                    </span>
                    <Badge className={OUTCOME_COLORS[fu.outcome] ?? ""}>
                      {OUTCOME_LABELS[fu.outcome] ?? fu.outcome}
                    </Badge>
                    {isOverdue && <Badge className="bg-red-100 text-red-700 text-[10px]">Overdue</Badge>}
                  </div>
                  {fu.notes && <p className="text-sm text-muted-foreground truncate">{fu.notes}</p>}
                  {fu.outcome_notes && <p className="text-xs text-muted-foreground mt-1 italic">→ {fu.outcome_notes}</p>}
                </div>
                {fu.outcome === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCompleteTarget(fu);
                      setOutcome(""); setOutcomeNotes(""); setScheduleNext(false); setNextDate("");
                    }}
                  >
                    <Check className="mr-1 h-3 w-3" /> Complete
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Add Follow-up Modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up</DialogTitle>
            <DialogDescription>Schedule a new follow-up for this enquiry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Date *</Label><Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} /></div>
            <div><Label>Time</Label><Input type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Call to discuss quotation..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!addDate || addMutation.isPending}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Complete Modal */}
      <Dialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Follow-up</DialogTitle>
            <DialogDescription>Record the outcome of this follow-up.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <div><Label>Notes</Label><Textarea value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} /></div>
            <div className="flex items-center justify-between">
              <Label>Schedule Next Follow-up?</Label>
              <Switch checked={scheduleNext} onCheckedChange={setScheduleNext} />
            </div>
            {scheduleNext && (
              <div><Label>Next Date *</Label><Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={!outcome || (scheduleNext && !nextDate) || completeMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
