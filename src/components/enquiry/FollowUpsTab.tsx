import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { completeFollowUp } from "@/lib/followUpCadence";

type FollowUp = Tables<"follow_ups">;
type FollowUpOutcome = FollowUp["outcome"];

const OUTCOME_COLORS: Record<string, string> = {
  pending: "bg-slate-200 text-slate-700",
  reached: "bg-green-100 text-green-700",
  no_response: "bg-red-100 text-red-700",
  callback_requested: "bg-amber-100 text-amber-700",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-gray-100 text-gray-400 line-through",
};

const OUTCOME_LABELS: Record<string, string> = {
  pending: "Pending",
  reached: "Reached",
  no_response: "No Response",
  callback_requested: "Callback Requested",
  closed: "Closed",
  cancelled: "Cancelled",
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
    queryFn: () => apiClient.get<FollowUp[]>("/follow-ups", { enquiry_id: enquiryId }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/follow-ups", {
        enquiry_id: enquiryId,
        scheduled_date: addDate,
        scheduled_time: addTime || null,
        notes: addNotes || null,
        outcome: "pending",
        auto_scheduled: false,
      });

      // Update enquiry next_follow_up if this date is earlier
      const enq = await apiClient.get<{ next_follow_up: string | null }>(`/enquiries/${enquiryId}`);
      if (!enq?.next_follow_up || addDate < enq.next_follow_up) {
        await apiClient.patch(`/enquiries/${enquiryId}`, { next_follow_up: addDate });
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
      await completeFollowUp({
        followUp: completeTarget,
        outcome,
        outcomeNotes,
        completedBy: user?.id ?? null,
        scheduleNext,
        nextDate,
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
        <h2 className="font-sora text-lg font-semibold text-foreground">Follow-ups</h2>
        <Button onClick={() => setShowAdd(true)} variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add Follow-up
        </Button>
      </div>

      {followUps.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No follow-ups scheduled."
          action={<Button onClick={() => setShowAdd(true)} variant="outline">Add Follow-up</Button>}
        />
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
                    {isOverdue && <Badge className="bg-red-100 text-red-700 text-[12px]">Overdue</Badge>}
                  </div>
                  {fu.notes && <p className="text-sm text-muted-foreground truncate">{fu.notes}</p>}
                  {fu.outcome_notes && <p className="text-[13px] text-muted-foreground mt-1 italic">→ {fu.outcome_notes}</p>}
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
