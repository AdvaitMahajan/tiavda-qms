import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Tables } from "@/integrations/supabase/types";
import { sendNotification } from "@/lib/notifications";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
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
import { STATUS_LABELS, ALL_STATUSES, PIPELINE_STATUSES, CLOSED_STATUSES } from "@/pages/Enquiries";
import { cancelPendingFollowUps, shouldCancelFollowUps } from "@/lib/followUpCadence";

export const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["intake_pending", "pending", "lost", "inactive"],
  intake_pending: ["pending", "lost", "inactive"],
  pending: ["sent", "lost", "inactive"],
  sent: ["follow_up", "negotiation", "approved", "lost", "inactive"],
  follow_up: ["sent", "negotiation", "approved", "lost", "inactive"],
  negotiation: ["sent", "approved", "lost", "inactive"],
  approved: ["payment_received", "lost", "inactive"],
  payment_received: ["mobilization_scheduled", "lost", "inactive"],
  mobilization_scheduled: ["job_active", "lost", "inactive"],
  job_active: ["completed", "lost", "inactive"],
  confirmed: ["completed", "lost", "inactive"],
  lost: ["follow_up"],
  inactive: ["follow_up"],
  completed: [],
};

interface Props {
  rows: EnquiryRow[];
  isLoading: boolean;
  statusFilter: LeadStatus[];
  search: string;
  showClosed: boolean;
}

export function EnquiryKanban({ rows, isLoading, showClosed }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      // Won (and therefore payment/mobilisation downstream) requires a finalized
      // quotation (approved/sent/accepted) — no advancing the pipeline off a draft.
      let wonQuote: { id: string; total_amount: number } | null = null;
      if (toStatus === "approved") {
        const quotes = await apiClient.get<Array<{ id: string; total_amount: number; status: string }>>(
          "/quotations",
          { enquiry_id: id },
        );
        const fq = quotes.find((q) => ["approved", "sent", "accepted"].includes(q.status));
        if (!fq) throw new Error("Approve and send a quotation to the client before marking this enquiry as Won.");
        wonQuote = { id: fq.id, total_amount: fq.total_amount };
      }

      const updates: Record<string, unknown> = { status: toStatus };
      if (toStatus === "lost") {
        updates.lost_reason = reason;
        updates.lost_date = new Date().toISOString().slice(0, 10);
      }
      if (toStatus === "inactive") {
        updates.lost_date = new Date().toISOString().slice(0, 10);
        updates.lost_reason = reason || "No response after follow-up cycle";
      }
      if (toStatus === "approved") {
        updates.confirmed_date = new Date().toISOString().slice(0, 10);
      }
      if (toStatus === "follow_up" && (fromStatus === "lost" || fromStatus === "inactive")) {
        updates.lost_date = null;
        updates.lost_reason = null;
      }

      await apiClient.patch(`/enquiries/${id}`, updates);

      const eventType = (fromStatus === "lost" || fromStatus === "inactive") && toStatus === "follow_up"
        ? "reactivated"
        : "status_change";
      await apiClient.post(`/enquiries/${id}/events`, {
        event_type: eventType,
        from_status: fromStatus,
        to_status: toStatus,
        metadata: reason ? { reason } : null,
      });

      if (toStatus === "approved" && wonQuote) {
        // Mark the winning quotation accepted so the quote status mirrors the deal.
        await apiClient.patch(`/quotations/${wonQuote.id}`, { status: "accepted" });

        // Auto-create the advance when the winning quote has a real total.
        if (Number(wonQuote.total_amount) > 0) {
          const advanceAmount = Math.round(Number(wonQuote.total_amount) * 0.5 * 100) / 100;
          await apiClient.post("/payments", {
            enquiry_id: id,
            quotation_id: wonQuote.id,
            payment_type: "advance",
            amount_requested: advanceAmount,
            status: "pending_request",
          });

          // Auto-send advance payment request to client
          const enq = await apiClient.get<Tables<"enquiries">>(`/enquiries/${id}`);
          const client = await apiClient.get<Tables<"clients">>(`/clients/${enq.client_id}`);
          const ref = enq.ref_number;
          const amt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(advanceAmount);

          if (client?.email && !client.email_bounced) {
            void sendNotification({
              to: client.email,
              template: "payment_request",
              params: { client_name: client.name, ref_number: ref, amount: amt },
            });
            await apiClient.post("/communications", {
              enquiry_id: id,
              client_id: enq.client_id,
              channel: "email",
              direction: "outbound",
              subject: `Advance Payment Request — ${ref}`,
              body: `Advance payment of ${amt} requested automatically on Won status`,
              status: "sent",
            });
          }

          if (client?.whatsapp_number && !client.whatsapp_invalid) {
            void apiClient
              .post("/integrations/whatsapp", {
                phone_number: client.whatsapp_number,
                template_name: "qms_payment_request",
                parameters: [
                  { name: "client_name", value: client.name },
                  { name: "ref_number", value: ref },
                  { name: "amount", value: amt },
                ],
              })
              .catch(() => {});
            await apiClient.post("/communications", {
              enquiry_id: id,
              client_id: enq.client_id,
              channel: "whatsapp",
              direction: "outbound",
              subject: `Advance Payment Request — ${ref}`,
              body: `Advance payment of ${amt} requested via WhatsApp`,
              status: "sent",
            });
          }
        }

        // get-or-create the job completion tracker (idempotent server-side)
        await apiClient.post("/job-completion", { enquiry_id: id });
      }

      if (shouldCancelFollowUps(toStatus)) {
        await cancelPendingFollowUps(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Could not update status.");
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

      if (!VALID_TRANSITIONS[card.status].includes(toStatus)) {
        toast.error(`Cannot move from ${STATUS_LABELS[card.status]} to ${STATUS_LABELS[toStatus]}`);
        return;
      }

      if (toStatus === "lost" || toStatus === "inactive") {
        setLostModal({ row: card, toStatus });
        return;
      }

      if (toStatus === "approved") {
        setConfirmModal(card);
        return;
      }

      if (toStatus === "follow_up" && (card.status === "lost" || card.status === "inactive")) {
        setLostModal({ row: card, toStatus });
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
    if (!lostModal) return;
    const isReactivation = lostModal.toStatus === "follow_up";
    if (!isReactivation && !lostReason.trim()) return;
    statusMutation.mutate(
      {
        id: lostModal.row.id,
        fromStatus: lostModal.row.status,
        toStatus: lostModal.toStatus,
        lostReason: isReactivation ? lostReason.trim() || "Reactivated" : lostReason.trim(),
      },
      {
        onSuccess: () => {
          const msg = isReactivation
            ? "Lead reactivated! Moved to Follow Up."
            : lostModal.toStatus === "inactive" ? "Marked as Inactive" : "Marked as Lost";
          toast.success(msg);
          setLostModal(null);
          setLostReason("");
        },
      }
    );
  };

  const handleConfirmConfirm = () => {
    if (!confirmModal) return;
    statusMutation.mutate(
      { id: confirmModal.id, fromStatus: confirmModal.status, toStatus: "approved" },
      {
        onSuccess: () => {
          toast.success("Marked as Won! Payment record and job tracker created.");
          setConfirmModal(null);
        },
      }
    );
  };

  const visibleStatuses = showClosed ? [...PIPELINE_STATUSES, ...CLOSED_STATUSES] : PIPELINE_STATUSES;

  if (isLoading) {
    return (
      <div className="w-full overflow-x-auto">
        <div className="flex gap-3 pb-4" style={{ minWidth: "max-content" }}>
          {visibleStatuses.map((s) => (
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

  const columns = visibleStatuses.map((status) => ({
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

      {/* Lost / Inactive / Reactivation Modal */}
      <Dialog open={!!lostModal} onOpenChange={(open) => { if (!open) { setLostModal(null); setLostReason(""); } }}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700 }}>
              {lostModal?.toStatus === "follow_up" ? "Reactivate Lead" : lostModal?.toStatus === "inactive" ? "Mark as Inactive" : "Reason for Loss"}
            </DialogTitle>
            <DialogDescription style={{ color: "#546E7A", fontSize: "14px" }}>
              {lostModal?.toStatus === "follow_up"
                ? "This lead will be moved back to Follow Up. Optionally add a reason."
                : lostModal?.toStatus === "inactive"
                ? "This lead will be marked inactive due to no response."
                : "Please provide a reason for marking this enquiry as lost."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={
              lostModal?.toStatus === "follow_up" ? "Reason for reactivation (optional)"
              : lostModal?.toStatus === "inactive" ? "Additional notes (optional)"
              : "Why was this enquiry lost?"
            }
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={3}
            style={{ borderColor: "#E0E7EF", borderRadius: "10px" }}
          />
          <DialogFooter>
            <button
              onClick={() => { setLostModal(null); setLostReason(""); }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              disabled={lostModal?.toStatus === "lost" && !lostReason.trim() || statusMutation.isPending}
              onClick={handleLostConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: lostModal?.toStatus === "follow_up"
                  ? "linear-gradient(135deg,#1565C0,#42A5F5)"
                  : lostModal?.toStatus === "inactive" ? "#78909C" : "#C62828",
                color: "white",
              }}
            >
              {lostModal?.toStatus === "follow_up" ? "Reactivate" : lostModal?.toStatus === "inactive" ? "Mark Inactive" : "Mark as Lost"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Won / Approved Modal */}
      <Dialog open={!!confirmModal} onOpenChange={(open) => { if (!open) setConfirmModal(null); }}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700 }}>
              Mark as Won?
            </DialogTitle>
            <DialogDescription style={{ color: "#546E7A", fontSize: "14px" }}>
              This will create a 50% advance payment record and a job completion tracker for this enquiry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              disabled={statusMutation.isPending}
              onClick={handleConfirmConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#00897B,#26A69A)", color: "white" }}
            >
              Confirm Won
            </button>
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
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-t-2xl"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E0E7EF",
          borderBottom: "none",
        }}
      >
        <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "#546E7A" }}>
          {STATUS_LABELS[status]}
        </span>
        <span
          className="text-[13px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "#F0F4F8", color: "#0A1929" }}
        >
          {cards.length}
        </span>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className="flex-1 p-2 min-h-[calc(100vh-280px)] transition-colors"
        style={{
          background: isOver ? "rgba(21,101,192,0.06)" : "rgba(255,255,255,0.6)",
          backdropFilter: "blur(4px)",
          border: isOver ? "2px dashed #1565C0" : "1px solid #E0E7EF",
          borderTop: "none",
          borderRadius: "0 0 12px 12px",
          ...(isOver ? { outline: "2px dashed #1565C0", outlineOffset: "-2px" } : {}),
        }}
      >
        {cards.length === 0 ? (
          <div
            className="rounded-lg p-3 text-center text-[13px] min-h-[60px] flex items-center justify-center"
            style={{ border: "2px dashed #E0E7EF", color: "#546E7A" }}
          >
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
      className="mb-2 cursor-grab active:cursor-grabbing"
      onClick={onClick}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E0E7EF",
          borderRadius: "12px",
          padding: "12px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-mono" style={{ color: "#546E7A" }}>{row.ref_number}</span>
          {row.service_type === "consultancy" ? (
            <span style={{ background: "#EDE7F6", color: "#7B1FA2", fontSize: "12px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px" }}>CONSULT</span>
          ) : (
            <span style={{ background: "#E3F2FD", color: "#1565C0", fontSize: "12px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px" }}>SI</span>
          )}
        </div>
        <div className="text-sm font-semibold leading-snug" style={{ color: "#0A1929" }}>{row.client_name}</div>
        <div className="text-[13px] mt-0.5" style={{ color: "#546E7A" }}>{row.site_city}</div>
        {row.quote_amount && (
          <div
            className="text-[13px] font-mono font-semibold mt-2 pt-2"
            style={{ color: "#0A1929", borderTop: "1px solid #F0F4F8" }}
          >
            {formatCurrency(Number(row.quote_amount))}
          </div>
        )}
        {row.next_follow_up && <FollowUpTag date={row.next_follow_up} />}
      </div>
    </motion.div>
  );
}

function KanbanCardOverlay({ row }: { row: EnquiryRow }) {
  return (
    <div
      className="rounded-xl p-3 shadow-lg w-[240px] rotate-2"
      style={{ background: "#FFFFFF", border: "1px solid #E0E7EF" }}
    >
      <p className="font-mono text-[12px]" style={{ color: "#546E7A" }}>{row.ref_number}</p>
      <p className="font-semibold text-sm" style={{ color: "#0A1929" }}>{row.client_name}</p>
      <p className="text-[13px]" style={{ color: "#546E7A" }}>{row.site_city}</p>
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
    <div
      className="text-[12px] mt-1.5 flex items-center gap-1"
      style={{ color: isOverdue ? "#C62828" : isToday ? "#E65100" : "#546E7A" }}
    >
      {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />}
      {label}
    </div>
  );
}
