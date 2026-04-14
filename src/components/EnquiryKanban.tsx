import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import type { EnquiryRow, LeadStatus } from "@/pages/Enquiries";
import { STATUS_LABELS, ALL_STATUSES } from "@/pages/Enquiries";

const COUNT_BADGE_CLASSES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 border border-slate-200",
  pending: "bg-blue-100 text-blue-700 border border-blue-200",
  sent: "bg-indigo-100 text-indigo-700 border border-indigo-200",
  follow_up: "bg-amber-100 text-amber-700 border border-amber-200",
  approved: "bg-purple-100 text-purple-700 border border-purple-200",
  confirmed: "bg-green-100 text-green-700 border border-green-200",
  lost: "bg-red-100 text-red-700 border border-red-200",
  completed: "bg-teal-100 text-teal-700 border border-teal-200",
};

const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["pending", "lost"],
  pending: ["sent", "lost"],
  sent: ["follow_up", "approved", "lost"],
  follow_up: ["sent", "approved", "lost"],
  approved: ["confirmed", "lost"],
  confirmed: ["completed"],
  lost: [],
  completed: [],
};

interface Props {
  rows: EnquiryRow[];
  isLoading: boolean;
  statusFilter: LeadStatus[];
  search: string;
}

export function EnquiryKanban({ rows, isLoading }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeCard, setActiveCard] = useState<EnquiryRow | null>(null);
  const [overColumn, setOverColumn] = useState<LeadStatus | null>(null);
  const [lostModal, setLostModal] = useState<{ row: EnquiryRow; toStatus: LeadStatus } | null>(null);
  const [confirmModal, setConfirmModal] = useState<EnquiryRow | null>(null);
  const [lostReason, setLostReason] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const statusMutation = useMutation({
    mutationFn: async ({ id, fromStatus, toStatus, lostReason: reason }: {
      id: string; fromStatus: LeadStatus; toStatus: LeadStatus; lostReason?: string;
    }) => {
      const updates: {
        status: LeadStatus;
        updated_at: string;
        lost_reason?: string;
        lost_date?: string;
        confirmed_date?: string;
      } = { status: toStatus, updated_at: new Date().toISOString() };
      if (toStatus === "lost") {
        updates.lost_reason = reason;
        updates.lost_date = new Date().toISOString().slice(0, 10);
      }
      if (toStatus === "confirmed") {
        updates.confirmed_date = new Date().toISOString().slice(0, 10);
      }

      const { error } = await supabase.from("enquiries").update(updates).eq("id", id);
      if (error) throw error;

      await supabase.from("enquiry_events").insert({
        enquiry_id: id,
        event_type: "status_change",
        from_status: fromStatus,
        to_status: toStatus,
        triggered_by: user?.id ?? null,
      });

      if (toStatus === "confirmed") {
        // Create payment record
        const { data: approvedQ } = await supabase
          .from("quotations")
          .select("total_amount, id")
          .eq("enquiry_id", id)
          .eq("status", "approved")
          .limit(1)
          .single();

        if (approvedQ) {
          await supabase.from("payments").insert({
            enquiry_id: id,
            quotation_id: approvedQ.id,
            payment_type: "advance",
            amount_requested: Number(approvedQ.total_amount) * 0.5,
            status: "pending_request",
          });
        }

        // Create job completion record
        const { data: existing } = await supabase
          .from("job_completion")
          .select("id")
          .eq("enquiry_id", id)
          .limit(1)
          .maybeSingle();

        if (!existing) {
          await supabase.from("job_completion").insert({ enquiry_id: id });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const card = rows.find((r) => r.id === event.active.id);
    setActiveCard(card ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (overId && ALL_STATUSES.includes(overId as LeadStatus)) {
      setOverColumn(overId as LeadStatus);
    } else {
      setOverColumn(null);
    }
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null);
      setOverColumn(null);

      const cardId = event.active.id as string;
      const droppedOn = event.over?.id as string | undefined;
      if (!droppedOn || !ALL_STATUSES.includes(droppedOn as LeadStatus)) return;

      const card = rows.find((r) => r.id === cardId);
      if (!card) return;

      const toStatus = droppedOn as LeadStatus;
      if (toStatus === card.status) return;

      // Validate transition
      if (!VALID_TRANSITIONS[card.status].includes(toStatus)) {
        toast.error(`Cannot move from ${STATUS_LABELS[card.status]} to ${STATUS_LABELS[toStatus]}`);
        return;
      }

      if (toStatus === "lost") {
        setLostModal({ row: card, toStatus });
        return;
      }

      if (toStatus === "confirmed") {
        setConfirmModal(card);
        return;
      }

      statusMutation.mutate(
        { id: card.id, fromStatus: card.status, toStatus },
        { onSuccess: () => toast.success(`Moved to ${STATUS_LABELS[toStatus]}`) }
      );
    },
    [rows, statusMutation]
  );

  const handleLostConfirm = () => {
    if (!lostModal || !lostReason.trim()) return;
    statusMutation.mutate(
      { id: lostModal.row.id, fromStatus: lostModal.row.status, toStatus: "lost", lostReason: lostReason.trim() },
      {
        onSuccess: () => {
          toast.success("Marked as Lost");
          setLostModal(null);
          setLostReason("");
        },
      }
    );
  };

  const handleConfirmConfirm = () => {
    if (!confirmModal) return;
    statusMutation.mutate(
      { id: confirmModal.id, fromStatus: confirmModal.status, toStatus: "confirmed" },
      {
        onSuccess: () => {
          toast.success("Marked as Confirmed! Payment record and job tracker created.");
          setConfirmModal(null);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="w-full overflow-x-auto">
        <div className="flex gap-3 pb-4" style={{ minWidth: "max-content" }}>
          {ALL_STATUSES.map((s) => (
            <div key={s} className="flex flex-col w-[200px] flex-shrink-0 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const columns = ALL_STATUSES.map((status) => ({
    status,
    cards: rows.filter((r) => r.status === status),
  }));

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="w-full overflow-x-auto">
          <div className="flex gap-3 pb-4" style={{ minWidth: "max-content" }}>
            {columns.map(({ status, cards }) => (
              <KanbanColumn
                key={status}
                status={status}
                cards={cards}
                isOver={overColumn === status}
                onCardClick={(id) => navigate(`/enquiries/${id}`)}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeCard && <KanbanCardOverlay row={activeCard} />}
        </DragOverlay>
      </DndContext>

      {/* Lost Reason Modal */}
      <Dialog open={!!lostModal} onOpenChange={(open) => { if (!open) { setLostModal(null); setLostReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason for Loss</DialogTitle>
            <DialogDescription>Please provide a reason for marking this enquiry as lost.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Why was this enquiry lost?"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLostModal(null); setLostReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!lostReason.trim() || statusMutation.isPending}
              onClick={handleLostConfirm}
            >
              Mark as Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmed Modal */}
      <Dialog open={!!confirmModal} onOpenChange={(open) => { if (!open) setConfirmModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Confirmed?</DialogTitle>
            <DialogDescription>
              This will automatically create a payment record and job completion tracker.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmModal(null)}>Cancel</Button>
            <Button disabled={statusMutation.isPending} onClick={handleConfirmConfirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KanbanColumn({ status, cards, isOver, onCardClick }: {
  status: LeadStatus; cards: EnquiryRow[]; isOver: boolean; onCardClick: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex flex-col w-[200px] flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-t-xl border-b-0">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {STATUS_LABELS[status]}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COUNT_BADGE_CLASSES[status]}`}>
          {cards.length}
        </span>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className={`flex-1 border border-slate-200 rounded-b-xl p-2 min-h-[400px] transition-colors ${
          isOver ? "bg-blue-50 ring-2 ring-dashed ring-blue-400" : "bg-slate-50"
        }`}
      >
        {cards.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-3 text-center text-xs text-slate-300 min-h-[60px] flex items-center justify-center">
            Drop here
          </div>
        ) : (
          cards.map((card) => (
            <KanbanCard key={card.id} row={card} onClick={() => onCardClick(card.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({ row, onClick }: { row: EnquiryRow; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      whileDrag={{ scale: 1.02 }}
      className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 mb-2 cursor-grab hover:shadow-md hover:border-slate-300 transition-all duration-150 active:cursor-grabbing active:scale-95"
      onClick={onClick}
    >
      <div className="text-[10px] font-mono text-slate-400 mb-1">{row.ref_number}</div>
      <div className="text-sm font-semibold text-[#0F2A47] leading-snug">{row.client_name}</div>
      <div className="text-xs text-slate-400 mt-0.5">{row.site_city}</div>
      {row.quote_amount && (
        <div className="text-xs font-mono font-semibold text-[#0F2A47] mt-2 pt-2 border-t border-slate-100">
          {formatCurrency(Number(row.quote_amount))}
        </div>
      )}
      {row.next_follow_up && <FollowUpTag date={row.next_follow_up} />}
    </motion.div>
  );
}

function KanbanCardOverlay({ row }: { row: EnquiryRow }) {
  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg w-[240px] rotate-2">
      <p className="font-mono text-[11px] text-muted-foreground">{row.ref_number}</p>
      <p className="font-semibold text-sm">{row.client_name}</p>
      <p className="text-xs text-muted-foreground">{row.site_city}</p>
    </div>
  );
}

function FollowUpTag({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = d < today;
  const isToday = d.toDateString() === today.toDateString();
  const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${isOverdue ? "text-red-500" : isToday ? "text-amber-600" : "text-slate-400"}`}>
      {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />}
      {label}
    </div>
  );
}
